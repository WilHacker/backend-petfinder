import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type MyPetRow = {
  mascota_id: string;
  nombre: string;
  estado: string;
  tipo_nombre: string;
  foto_url: string | null;
  lat: number | null;
  lng: number | null;
  recompensa: string | null;
};

type PublicLostPetRow = {
  reporte_id: number;
  mascota_id: string;
  nombre: string;
  tipo_nombre: string;
  foto_principal_url: string | null;
  lat: number;
  lng: number;
  fecha_perdida: Date;
  recompensa: string | null;
  alerta_comunidad_activa: boolean;
  alerta_comunidad_expira_el: Date | null;
};

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
  fecha_perdida: Date;
  recompensa: string | null;
  alerta_comunidad_activa: boolean;
  alerta_comunidad_expira_el: Date | null;
};

type ZonaSnapshotRow = {
  zona_id: number;
  nombre_zona: string | null;
  esta_activa: boolean | null;
  radio_metros: number | null;
  centro_lat: number | null;
  centro_lng: number | null;
  geometria_json: string | null;
  mascota_ids: string[] | string;
};

@Injectable()
export class MapService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(personaId: string, tipoId?: number) {
    const [misMascotasRaw, coOwnersRaw, lostPetsRaw, zonasRaw] = await Promise.all([
      // Mascotas propias del usuario autenticado
      this.prisma.$queryRaw<MyPetRow[]>`
        SELECT
          m.mascota_id::text,
          m.nombre,
          m.estado::text,
          COALESCE(tm.nombre, 'Sin tipo') AS tipo_nombre,
          (SELECT f.foto_url FROM fotos_mascota f
           WHERE f.mascota_id = m.mascota_id
           ORDER BY f.es_principal DESC, f.foto_id ASC
           LIMIT 1) AS foto_url,
          CASE WHEN m.ultima_ubicacion_conocida IS NOT NULL
               THEN ST_Y(m.ultima_ubicacion_conocida::geometry) END AS lat,
          CASE WHEN m.ultima_ubicacion_conocida IS NOT NULL
               THEN ST_X(m.ultima_ubicacion_conocida::geometry) END AS lng,
          CASE WHEN m.estado = 'extraviada'
               THEN r.recompensa::text END AS recompensa
        FROM propietarios_mascota pm
        JOIN mascotas m        ON m.mascota_id = pm.mascota_id
        LEFT JOIN tipos_mascota tm ON tm.tipo_id = m.tipo_id
        LEFT JOIN reportes_extravio r
               ON r.mascota_id    = m.mascota_id
              AND r.estado_reporte = 'abierto'
        WHERE pm.persona_id = ${personaId}::uuid
        ORDER BY m.nombre
      `,

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
          ST_X(r.ultima_ubicacion_conocida::geometry) AS lng,
          r.fecha_perdida,
          r.recompensa::text,
          (r.alerta_comunidad_activa AND (r.alerta_comunidad_expira_el IS NULL OR r.alerta_comunidad_expira_el > NOW())) AS alerta_comunidad_activa,
          r.alerta_comunidad_expira_el
        FROM reportes_extravio r
        JOIN mascotas m        ON m.mascota_id = r.mascota_id
        LEFT JOIN tipos_mascota tm ON tm.tipo_id = m.tipo_id
        WHERE r.estado_reporte              = 'abierto'
          AND r.ultima_ubicacion_conocida IS NOT NULL
          AND (${tipoId ?? null}::int IS NULL OR m.tipo_id = ${tipoId ?? null}::int)
        ORDER BY r.fecha_perdida DESC
        LIMIT 50
      `,

      // Zonas seguras del usuario — solo IDs de mascotas asociadas
      this.prisma.$queryRaw<ZonaSnapshotRow[]>`
        SELECT
          z.zona_id,
          z.nombre_zona,
          z.esta_activa,
          z.radio_metros,
          CASE WHEN z.punto_central IS NOT NULL
               THEN ST_Y(z.punto_central::geometry) END AS centro_lat,
          CASE WHEN z.punto_central IS NOT NULL
               THEN ST_X(z.punto_central::geometry) END AS centro_lng,
          ST_AsGeoJSON(z.geometria) AS geometria_json,
          ARRAY_AGG(zm.mascota_id::text ORDER BY m.nombre) AS mascota_ids
        FROM zonas_seguras z
        JOIN zona_mascotas zm ON zm.zona_id = z.zona_id
        JOIN mascotas m       ON m.mascota_id = zm.mascota_id
        JOIN propietarios_mascota pm ON pm.mascota_id = zm.mascota_id
        WHERE pm.persona_id = ${personaId}::uuid
        GROUP BY z.zona_id, z.nombre_zona, z.esta_activa, z.radio_metros, z.punto_central, z.geometria
        ORDER BY z.zona_id
      `,
    ]);

    return {
      misMascotas: misMascotasRaw.map((m) => {
        const base = {
          mascotaId: m.mascota_id,
          nombre: m.nombre,
          estado: m.estado,
          tipo: m.tipo_nombre,
          fotoUrl: m.foto_url,
          ubicacion:
            m.lat != null && m.lng != null ? { lat: Number(m.lat), lng: Number(m.lng) } : null,
        };
        if (m.estado === 'extraviada' && m.recompensa != null) {
          return { ...base, recompensa: Number(m.recompensa) };
        }
        return base;
      }),

      colaboradores: coOwnersRaw.map((o) => ({
        personaId: o.persona_id,
        nombre: o.nombre,
        apellidoPaterno: o.apellido_paterno,
        fotoUrl: o.foto_perfil_url,
        ubicacion: { lat: Number(o.lat), lng: Number(o.lng) },
      })),

      desaparecidas: lostPetsRaw.map((r) => ({
        reporteId: Number(r.reporte_id),
        mascotaId: r.mascota_id,
        nombre: r.nombre,
        tipo: r.tipo_nombre,
        fotoUrl: r.foto_principal_url,
        ubicacion: { lat: Number(r.lat), lng: Number(r.lng) },
        fechaPerdida: r.fecha_perdida,
        recompensa: r.recompensa != null ? Number(r.recompensa) : null,
        alertaComunidad: r.alerta_comunidad_activa
          ? { activa: true, expiraEl: r.alerta_comunidad_expira_el }
          : { activa: false, expiraEl: null },
      })),

      zonas: zonasRaw.map((z) => {
        const mascotaIds = Array.isArray(z.mascota_ids)
          ? z.mascota_ids
          : (JSON.parse(z.mascota_ids) as string[]);

        const base = {
          zonaId: Number(z.zona_id),
          nombre: z.nombre_zona,
          estado: z.esta_activa ? 'activa' : 'inactiva',
          mascotaIds,
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

  // Endpoint público — no requiere autenticación
  async getPublicLostPets(tipoId?: number) {
    const rows = await this.prisma.$queryRaw<PublicLostPetRow[]>`
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
        ST_X(r.ultima_ubicacion_conocida::geometry) AS lng,
        r.fecha_perdida,
        r.recompensa::text,
        (r.alerta_comunidad_activa AND (r.alerta_comunidad_expira_el IS NULL OR r.alerta_comunidad_expira_el > NOW())) AS alerta_comunidad_activa,
        r.alerta_comunidad_expira_el
      FROM reportes_extravio r
      JOIN mascotas m        ON m.mascota_id = r.mascota_id
      LEFT JOIN tipos_mascota tm ON tm.tipo_id = m.tipo_id
      WHERE r.estado_reporte              = 'abierto'
        AND r.ultima_ubicacion_conocida IS NOT NULL
        AND (${tipoId ?? null}::int IS NULL OR m.tipo_id = ${tipoId ?? null}::int)
      ORDER BY r.fecha_perdida DESC
      LIMIT 100
    `;

    return rows.map((r) => ({
      reporteId: Number(r.reporte_id),
      mascotaId: r.mascota_id,
      nombre: r.nombre,
      tipo: r.tipo_nombre,
      fotoUrl: r.foto_principal_url,
      ubicacion: { lat: Number(r.lat), lng: Number(r.lng) },
      fechaPerdida: r.fecha_perdida,
      recompensa: r.recompensa != null ? Number(r.recompensa) : null,
      alertaComunidad: r.alerta_comunidad_activa
        ? { activa: true, expiraEl: r.alerta_comunidad_expira_el }
        : { activa: false, expiraEl: null },
    }));
  }
}
