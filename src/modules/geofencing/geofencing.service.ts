import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Injectable()
export class GeofencingService {
  constructor(private readonly prisma: PrismaService) {}

  async createZone(mascotaId: string, personaId: string, dto: CreateZoneDto) {
    await this.checkPetOwnership(mascotaId, personaId);

    if (dto.tipo === 'circulo') {
      await this.prisma.$executeRaw`
        INSERT INTO zonas_seguras (mascota_id, nombre_zona, punto_central, radio_metros, esta_activa)
        VALUES (
          ${mascotaId}::uuid,
          ${dto.nombreZona},
          ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326),
          ${dto.radioMetros},
          true
        )
      `;
    } else {
      const coordList = dto.coordenadas!;
      const ring = [...coordList, coordList[0]];
      const wkt = `POLYGON((${ring.map((c) => `${c.lng} ${c.lat}`).join(',')}))`;
      const centroLng = coordList.reduce((s, c) => s + c.lng, 0) / coordList.length;
      const centroLat = coordList.reduce((s, c) => s + c.lat, 0) / coordList.length;

      await this.prisma.$executeRaw`
        INSERT INTO zonas_seguras (mascota_id, nombre_zona, geometria, punto_central, esta_activa)
        VALUES (
          ${mascotaId}::uuid,
          ${dto.nombreZona},
          ST_SetSRID(ST_GeomFromText(${wkt}), 4326),
          ST_SetSRID(ST_MakePoint(${centroLng}, ${centroLat}), 4326),
          true
        )
      `;
    }

    return this.prisma.zonaSegura.findFirst({
      where: { mascotaId, nombreZona: dto.nombreZona },
      orderBy: { zonaId: 'desc' },
    });
  }

  async findZones(mascotaId: string, personaId: string) {
    await this.checkPetOwnership(mascotaId, personaId);

    return this.prisma.$queryRaw<
      Array<{
        zona_id: number;
        nombre_zona: string;
        radio_metros: number | null;
        esta_activa: boolean;
        centro_lat: number | null;
        centro_lng: number | null;
      }>
    >`
      SELECT
        zona_id,
        nombre_zona,
        radio_metros,
        esta_activa,
        ST_Y(punto_central::geometry) AS centro_lat,
        ST_X(punto_central::geometry) AS centro_lng
      FROM zonas_seguras
      WHERE mascota_id = ${mascotaId}::uuid
      ORDER BY zona_id
    `;
  }

  async findZone(mascotaId: string, zonaId: number, personaId: string) {
    await this.checkPetOwnership(mascotaId, personaId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        zona_id: number;
        nombre_zona: string | null;
        radio_metros: number | null;
        esta_activa: boolean | null;
        centro_lat: number | null;
        centro_lng: number | null;
        geometria_geojson: string | null;
      }>
    >`
      SELECT
        zona_id,
        nombre_zona,
        radio_metros,
        esta_activa,
        ST_Y(punto_central::geometry)  AS centro_lat,
        ST_X(punto_central::geometry)  AS centro_lng,
        ST_AsGeoJSON(geometria)        AS geometria_geojson
      FROM zonas_seguras
      WHERE zona_id = ${zonaId}
        AND mascota_id = ${mascotaId}::uuid
    `;

    if (!rows.length) throw new NotFoundException('Zona segura no encontrada');
    return rows[0];
  }

  async updateZone(mascotaId: string, zonaId: number, personaId: string, dto: UpdateZoneDto) {
    await this.checkPetOwnership(mascotaId, personaId);

    const zona = await this.prisma.zonaSegura.findFirst({
      where: { zonaId, mascotaId },
    });
    if (!zona) throw new NotFoundException('Zona segura no encontrada');

    if (dto.nombreZona) {
      await this.prisma.zonaSegura.update({
        where: { zonaId },
        data: { nombreZona: dto.nombreZona },
      });
    }

    if (dto.tipo === 'circulo' && dto.lat && dto.lng && dto.radioMetros) {
      await this.prisma.$executeRaw`
        UPDATE zonas_seguras
        SET
          punto_central = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326),
          radio_metros = ${dto.radioMetros}
        WHERE zona_id = ${zonaId}
      `;
    } else if (dto.tipo === 'poligono' && dto.coordenadas) {
      const ring = [...dto.coordenadas, dto.coordenadas[0]];
      const wkt = `POLYGON((${ring.map((c) => `${c.lng} ${c.lat}`).join(',')}))`;
      await this.prisma.$executeRaw`
        UPDATE zonas_seguras
        SET geometria = ST_SetSRID(ST_GeomFromText(${wkt}), 4326)
        WHERE zona_id = ${zonaId}
      `;
    }

    return this.prisma.zonaSegura.findUnique({ where: { zonaId } });
  }

  async removeZone(mascotaId: string, zonaId: number, personaId: string) {
    await this.checkPetOwnership(mascotaId, personaId);

    const zona = await this.prisma.zonaSegura.findFirst({
      where: { zonaId, mascotaId },
    });
    if (!zona) throw new NotFoundException('Zona segura no encontrada');

    await this.prisma.zonaSegura.delete({ where: { zonaId } });
    return { message: 'Zona eliminada' };
  }

  private async checkPetOwnership(mascotaId: string, personaId: string) {
    const relacion = await this.prisma.propietarioMascota.findUnique({
      where: { personaId_mascotaId: { personaId, mascotaId } },
    });
    if (!relacion) throw new ForbiddenException('No tienes acceso a esta mascota');
  }
}
