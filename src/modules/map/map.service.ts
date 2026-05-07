import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CoOwnerRow = {
  persona_id: string;
  nombre: string;
  apellido_paterno: string;
  foto_perfil_url: string | null;
  lat: number | null;
  lng: number | null;
};

type LostPetRow = {
  reporte_id: number;
  mascota_id: string;
  nombre: string;
  tipo_nombre: string;
  foto_principal_url: string | null;
  lat: number | null;
  lng: number | null;
};

type ZonaSnapshotRow = {
  zona_id: number;
  nombre_zona: string | null;
  radio_metros: number | null;
  centro_lat: number | null;
  centro_lng: number | null;
  geometria_json: string | null;
  // JSON_AGG devuelve objeto ya parseado por el driver pg
  mascotas: Array<{ mascotaId: string; nombre: string; fotoUrl: string | null }> | string;
};

@Injectable()
export class MapService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(personaId: string) {
    const [coOwnersRaw, lostPetsRaw, zonasRaw] = await Promise.all([
      // Co-propietarios/cuidadores con GPS activo
      this.prisma.$queryRaw<CoOwnerRow[]>`
        SELECT DISTINCT ON (p.persona_id)
          p.persona_id::text,
          p.nombre,
          p.apellido_paterno,
          p.foto_perfil_url,
          ST_Y(u.ultima_ubicacion_conocida::geometry) AS lat,
          ST_X(u.ultima_ubicacion_conocida::geometry) AS lng
        FROM propietarios_mascota pm_mine
        JOIN propietarios_mascota pm
          ON pm.mascota_id  = pm_mine.mascota_id
         AND pm.persona_id != ${personaId}::uuid
        JOIN personas p  ON p.persona_id  = pm.persona_id
        JOIN usuarios u  ON u.persona_id  = p.persona_id
        WHERE pm_mine.persona_id           = ${personaId}::uuid
          AND u.ultima_ubicacion_conocida IS NOT NULL
          AND u.estado_cuenta              = 'activa'
        ORDER BY p.persona_id
      `,

      // Mascotas con reporte de extravío abierto (máx. 50 más recientes)
      this.prisma.$queryRaw<LostPetRow[]>`
        SELECT
          r.reporte_id,
          r.mascota_id::text,
          m.nombre,
          COALESCE(tm.nombre, 'Sin tipo') AS tipo_nombre,
          (SELECT f.foto_url FROM fotos_mascota f
           WHERE f.mascota_id = m.mascota_id
           ORDER BY f.es_principal DESC, f.foto_id ASC
           LIMIT 1) AS foto_principal_url,
          ST_Y(r.ultima_ubicacion_conocida::geometry) AS lat,
          ST_X(r.ultima_ubicacion_conocida::geometry) AS lng
        FROM reportes_extravio r
        JOIN mascotas m        ON m.mascota_id = r.mascota_id
        LEFT JOIN tipos_mascota tm ON tm.tipo_id = m.tipo_id
        WHERE r.estado_reporte              = 'abierto'
          AND r.ultima_ubicacion_conocida IS NOT NULL
        ORDER BY r.fecha_perdida DESC
        LIMIT 50
      `,

      // Zonas seguras del usuario con sus mascotas asociadas
      this.prisma.$queryRaw<ZonaSnapshotRow[]>`
        SELECT
          z.zona_id,
          z.nombre_zona,
          z.radio_metros,
          CASE WHEN z.punto_central IS NOT NULL
               THEN ST_Y(z.punto_central::geometry) END AS centro_lat,
          CASE WHEN z.punto_central IS NOT NULL
               THEN ST_X(z.punto_central::geometry) END AS centro_lng,
          ST_AsGeoJSON(z.geometria) AS geometria_json,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'mascotaId', zm.mascota_id::text,
              'nombre',    m.nombre,
              'fotoUrl',   (SELECT f.foto_url FROM fotos_mascota f
                            WHERE f.mascota_id = m.mascota_id
                            ORDER BY f.es_principal DESC, f.foto_id ASC
                            LIMIT 1)
            ) ORDER BY m.nombre
          ) AS mascotas
        FROM zonas_seguras z
        JOIN zona_mascotas zm ON zm.zona_id = z.zona_id
        JOIN mascotas m       ON m.mascota_id = zm.mascota_id
        JOIN propietarios_mascota pm ON pm.mascota_id = zm.mascota_id
        WHERE pm.persona_id = ${personaId}::uuid
          AND z.esta_activa = true
        GROUP BY z.zona_id, z.nombre_zona, z.radio_metros, z.punto_central, z.geometria
        ORDER BY z.zona_id
      `,
    ]);

    return {
      marcadores: {
        usuariosCompartidos: coOwnersRaw.map((o) => ({
          personaId: o.persona_id,
          nombre: `${o.nombre} ${o.apellido_paterno}`.trim(),
          fotoUrl: o.foto_perfil_url,
          lat: Number(o.lat),
          lng: Number(o.lng),
        })),
        desaparecidas: lostPetsRaw.map((r) => ({
          reporteId: Number(r.reporte_id),
          mascotaId: r.mascota_id,
          nombre: r.nombre,
          tipo: r.tipo_nombre,
          fotoUrl: r.foto_principal_url,
          lat: Number(r.lat),
          lng: Number(r.lng),
        })),
      },
      zonas: zonasRaw.map((z) => {
        const mascotas =
          typeof z.mascotas === 'string'
            ? (JSON.parse(z.mascotas) as ZonaSnapshotRow['mascotas'])
            : z.mascotas;

        const base = {
          zonaId: Number(z.zona_id),
          nombre: z.nombre_zona,
          mascotas: mascotas as Array<{
            mascotaId: string;
            nombre: string;
            fotoUrl: string | null;
          }>,
        };

        if (z.radio_metros != null) {
          return {
            ...base,
            tipo: 'circulo' as const,
            centro: { lat: Number(z.centro_lat), lng: Number(z.centro_lng) },
            radioMetros: Number(z.radio_metros),
          };
        }

        return {
          ...base,
          tipo: 'poligono' as const,
          geometria: z.geometria_json ? (JSON.parse(z.geometria_json) as object) : null,
        };
      }),
    };
  }
}
