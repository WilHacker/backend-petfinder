import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Injectable()
export class GeofencingService {
  constructor(private readonly prisma: PrismaService) {}

  async createZone(primaryMascotaId: string, personaId: string, dto: CreateZoneDto) {
    await this.checkPetOwnership(primaryMascotaId, personaId);

    // Construir la zona y obtener el zona_id con RETURNING
    let zonaId: number;

    if (dto.tipo === 'circulo') {
      const [row] = await this.prisma.$queryRaw<Array<{ zona_id: number }>>`
        INSERT INTO zonas_seguras (nombre_zona, punto_central, radio_metros, esta_activa)
        VALUES (
          ${dto.nombreZona},
          ST_SetSRID(ST_MakePoint(${dto.lng!}, ${dto.lat!}), 4326),
          ${dto.radioMetros!},
          true
        )
        RETURNING zona_id
      `;
      zonaId = row.zona_id;
    } else {
      const ring = [...dto.coordenadas!, dto.coordenadas![0]];
      const wkt = `POLYGON((${ring.map((c) => `${c.lng} ${c.lat}`).join(',')}))`;
      const centroLng = dto.coordenadas!.reduce((s, c) => s + c.lng, 0) / dto.coordenadas!.length;
      const centroLat = dto.coordenadas!.reduce((s, c) => s + c.lat, 0) / dto.coordenadas!.length;

      const [row] = await this.prisma.$queryRaw<Array<{ zona_id: number }>>`
        INSERT INTO zonas_seguras (nombre_zona, geometria, punto_central, esta_activa)
        VALUES (
          ${dto.nombreZona},
          ST_SetSRID(ST_GeomFromText(${wkt}), 4326),
          ST_SetSRID(ST_MakePoint(${centroLng}, ${centroLat}), 4326),
          true
        )
        RETURNING zona_id
      `;
      zonaId = row.zona_id;
    }

    // Verificar que el usuario también sea dueño de las mascotas adicionales
    const extraIds = (dto.mascotaIds ?? []).filter((id) => id !== primaryMascotaId);
    for (const id of extraIds) {
      await this.checkPetOwnership(id, personaId);
    }

    // Asociar mascotas a la zona (el petId del URL + extras del DTO, sin duplicados)
    const allIds = [...new Set([primaryMascotaId, ...extraIds])];
    await this.prisma.zonaMascota.createMany({
      data: allIds.map((mascotaId) => ({ zonaId, mascotaId })),
      skipDuplicates: true,
    });

    return this.findZone(zonaId, personaId);
  }

  async findMyZones(personaId: string) {
    return this.prisma.$queryRaw<
      Array<{
        zona_id: number;
        nombre_zona: string | null;
        tipo: 'circulo' | 'poligono';
        radio_metros: number | null;
        esta_activa: boolean;
        centro_lat: number | null;
        centro_lng: number | null;
        mascotas: Array<{
          mascota_id: string;
          nombre: string;
          estado: string | null;
          tipo_mascota: string | null;
        }>;
      }>
    >`
      SELECT
        z.zona_id,
        z.nombre_zona,
        CASE WHEN z.radio_metros IS NOT NULL THEN 'circulo' ELSE 'poligono' END AS tipo,
        z.radio_metros,
        z.esta_activa,
        ST_Y(z.punto_central::geometry) AS centro_lat,
        ST_X(z.punto_central::geometry) AS centro_lng,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'mascota_id', m.mascota_id,
            'nombre',     m.nombre,
            'estado',     m.estado,
            'tipo_mascota', tm.nombre
          )
          ORDER BY m.nombre
        ) AS mascotas
      FROM zonas_seguras z
      JOIN zona_mascotas zm         ON zm.zona_id    = z.zona_id
      JOIN mascotas m               ON m.mascota_id  = zm.mascota_id
      LEFT JOIN tipos_mascota tm    ON tm.tipo_id    = m.tipo_id
      JOIN propietarios_mascota pm  ON pm.mascota_id = m.mascota_id
                                   AND pm.persona_id = ${personaId}::uuid
      GROUP BY z.zona_id, z.nombre_zona, z.radio_metros, z.esta_activa, z.punto_central
      ORDER BY z.zona_id
    `;
  }

  async findZones(mascotaId: string, personaId: string) {
    await this.checkPetOwnership(mascotaId, personaId);

    return this.prisma.$queryRaw<
      Array<{
        zona_id: number;
        nombre_zona: string | null;
        radio_metros: number | null;
        esta_activa: boolean;
        centro_lat: number | null;
        centro_lng: number | null;
        mascota_ids: string[];
      }>
    >`
      SELECT
        z.zona_id,
        z.nombre_zona,
        z.radio_metros,
        z.esta_activa,
        ST_Y(z.punto_central::geometry) AS centro_lat,
        ST_X(z.punto_central::geometry) AS centro_lng,
        ARRAY_AGG(zm2.mascota_id::text) AS mascota_ids
      FROM zonas_seguras z
      JOIN zona_mascotas zm  ON zm.zona_id  = z.zona_id AND zm.mascota_id = ${mascotaId}::uuid
      JOIN zona_mascotas zm2 ON zm2.zona_id = z.zona_id
      GROUP BY z.zona_id, z.nombre_zona, z.radio_metros, z.esta_activa, z.punto_central
      ORDER BY z.zona_id
    `;
  }

  async findZone(zonaId: number, personaId: string) {
    // Verifica que el usuario tenga al menos una mascota en esta zona
    await this.checkZoneAccess(zonaId, personaId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        zona_id: number;
        nombre_zona: string | null;
        radio_metros: number | null;
        esta_activa: boolean | null;
        centro_lat: number | null;
        centro_lng: number | null;
        geometria_geojson: string | null;
        mascota_ids: string[];
      }>
    >`
      SELECT
        z.zona_id,
        z.nombre_zona,
        z.radio_metros,
        z.esta_activa,
        ST_Y(z.punto_central::geometry) AS centro_lat,
        ST_X(z.punto_central::geometry) AS centro_lng,
        ST_AsGeoJSON(z.geometria)       AS geometria_geojson,
        ARRAY_AGG(zm.mascota_id::text)  AS mascota_ids
      FROM zonas_seguras z
      JOIN zona_mascotas zm ON zm.zona_id = z.zona_id
      WHERE z.zona_id = ${zonaId}
      GROUP BY z.zona_id, z.nombre_zona, z.radio_metros, z.esta_activa, z.punto_central, z.geometria
    `;

    if (!rows.length) throw new NotFoundException('Zona segura no encontrada');
    return rows[0];
  }

  async updateZone(zonaId: number, personaId: string, dto: UpdateZoneDto) {
    await this.checkZoneAccess(zonaId, personaId);

    if (dto.nombreZona) {
      await this.prisma.zonaSegura.update({
        where: { zonaId },
        data: { nombreZona: dto.nombreZona },
      });
    }

    // Updates parciales: cada campo se aplica si está presente en el DTO
    if (dto.lat !== undefined && dto.lng !== undefined) {
      await this.prisma.$executeRaw`
        UPDATE zonas_seguras
        SET punto_central = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)
        WHERE zona_id = ${zonaId}
      `;
    }

    if (dto.radioMetros !== undefined) {
      await this.prisma.$executeRaw`
        UPDATE zonas_seguras
        SET radio_metros = ${dto.radioMetros}
        WHERE zona_id = ${zonaId}
      `;
    }

    if (dto.coordenadas?.length) {
      const ring = [...dto.coordenadas, dto.coordenadas[0]];
      const wkt = `POLYGON((${ring.map((c) => `${c.lng} ${c.lat}`).join(',')}))`;
      const centroLng = dto.coordenadas.reduce((s, c) => s + c.lng, 0) / dto.coordenadas.length;
      const centroLat = dto.coordenadas.reduce((s, c) => s + c.lat, 0) / dto.coordenadas.length;
      await this.prisma.$executeRaw`
        UPDATE zonas_seguras
        SET
          geometria     = ST_SetSRID(ST_GeomFromText(${wkt}), 4326),
          punto_central = ST_SetSRID(ST_MakePoint(${centroLng}, ${centroLat}), 4326)
        WHERE zona_id = ${zonaId}
      `;
    }

    return this.findZone(zonaId, personaId);
  }

  async removeZone(zonaId: number, personaId: string) {
    await this.checkZoneAccess(zonaId, personaId);
    await this.prisma.zonaSegura.delete({ where: { zonaId } });
    return { message: 'Zona eliminada' };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async checkPetOwnership(mascotaId: string, personaId: string) {
    const rel = await this.prisma.propietarioMascota.findUnique({
      where: { personaId_mascotaId: { personaId, mascotaId } },
    });
    if (!rel) throw new ForbiddenException('No tienes acceso a esta mascota');
  }

  private async checkZoneAccess(zonaId: number, personaId: string) {
    const rel = await this.prisma.zonaMascota.findFirst({
      where: {
        zonaId,
        mascota: { propietarios: { some: { personaId } } },
      },
    });
    if (!rel) throw new ForbiddenException('No tienes acceso a esta zona');
  }
}
