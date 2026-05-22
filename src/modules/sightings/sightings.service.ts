import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { CreateSightingDto } from './dto/create-sighting.dto';
import { CreateThanksDto } from './dto/create-thanks.dto';

type SightingRow = {
  avistamiento_id: string;
  mascota_id: string;
  mensaje_rescatista: string | null;
  foto_evidencia_url: string | null;
  fecha_avistamiento: Date;
  lat: number;
  lng: number;
};

@Injectable()
export class SightingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async createSighting(mascotaId: string, dto: CreateSightingDto, file?: Express.Multer.File) {
    const mascota = await this.prisma.mascota.findUnique({ where: { mascotaId } });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');

    let fotoUrl: string | null = null;
    if (file) {
      const result = await this.cloudinary.uploadBuffer(file.buffer, `avistamientos/${mascotaId}`);
      fotoUrl = result.secure_url;
    }

    const [row] = await this.prisma.$queryRaw<Array<{ avistamiento_id: string }>>`
      INSERT INTO avistamientos (mascota_id, ubicacion_gps, mensaje_rescatista, foto_evidencia_url)
      VALUES (
        ${mascotaId}::uuid,
        ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326),
        ${dto.mensajeRescatista ?? null},
        ${fotoUrl}
      )
      RETURNING avistamiento_id
    `;

    return this.findSighting(row.avistamiento_id);
  }

  async getSightings(mascotaId: string, personaId: string) {
    await this.checkPetAccess(mascotaId, personaId);
    return this.querySightings(mascotaId);
  }

  async createThanks(avistamientoId: string, usuarioId: string, dto: CreateThanksDto) {
    const avistamiento = await this.prisma.avistamiento.findUnique({
      where: { avistamientoId },
      include: {
        mascota: {
          include: { propietarios: { include: { persona: { include: { usuario: true } } } } },
        },
      },
    });
    if (!avistamiento) throw new NotFoundException('Avistamiento no encontrado');

    const esPropietario = avistamiento.mascota?.propietarios.some(
      (p) => p.persona.usuario?.usuarioId === usuarioId,
    );
    if (!esPropietario) throw new ForbiddenException('Solo el dueño puede agradecer');

    return this.prisma.agradecimientoRescatista.create({
      data: { avistamientoId, autorUsuarioId: usuarioId, mensaje: dto.mensaje },
    });
  }

  async getThanks(avistamientoId: string) {
    const avistamiento = await this.prisma.avistamiento.findUnique({
      where: { avistamientoId },
    });
    if (!avistamiento) throw new NotFoundException('Avistamiento no encontrado');

    return this.prisma.agradecimientoRescatista.findMany({
      where: { avistamientoId },
      orderBy: { creadoEl: 'asc' },
      select: {
        agradecimientoId: true,
        avistamientoId: true,
        mensaje: true,
        creadoEl: true,
        autor: {
          select: {
            usuarioId: true,
            persona: { select: { nombre: true, apellidoPaterno: true, fotoPerfilUrl: true } },
          },
        },
      },
    });
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async findSighting(avistamientoId: string) {
    const rows = await this.prisma.$queryRaw<SightingRow[]>`
      SELECT
        a.avistamiento_id::text,
        a.mascota_id::text,
        a.mensaje_rescatista,
        a.foto_evidencia_url,
        a.fecha_avistamiento,
        ST_Y(a.ubicacion_gps::geometry) AS lat,
        ST_X(a.ubicacion_gps::geometry) AS lng
      FROM avistamientos a
      WHERE a.avistamiento_id = ${avistamientoId}::uuid
    `;
    if (!rows.length) throw new NotFoundException('Avistamiento no encontrado');
    return this.mapRow(rows[0]);
  }

  private async querySightings(mascotaId: string) {
    const rows = await this.prisma.$queryRaw<SightingRow[]>`
      SELECT
        a.avistamiento_id::text,
        a.mascota_id::text,
        a.mensaje_rescatista,
        a.foto_evidencia_url,
        a.fecha_avistamiento,
        ST_Y(a.ubicacion_gps::geometry) AS lat,
        ST_X(a.ubicacion_gps::geometry) AS lng
      FROM avistamientos a
      WHERE a.mascota_id = ${mascotaId}::uuid
      ORDER BY a.fecha_avistamiento DESC
    `;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(r: SightingRow) {
    return {
      avistamientoId: r.avistamiento_id,
      mascotaId: r.mascota_id,
      mensajeRescatista: r.mensaje_rescatista,
      fotoEvidenciaUrl: r.foto_evidencia_url,
      fechaAvistamiento: r.fecha_avistamiento,
      lat: Number(r.lat),
      lng: Number(r.lng),
    };
  }

  private async checkPetAccess(mascotaId: string, personaId: string) {
    const rel = await this.prisma.propietarioMascota.findUnique({
      where: { personaId_mascotaId: { personaId, mascotaId } },
    });
    if (!rel) throw new ForbiddenException('No tienes acceso a esta mascota');
  }
}
