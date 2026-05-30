import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { NotificationsService } from '../../infrastructure/notifications/notifications.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { CreateSightingDto } from './dto/create-sighting.dto';
import { CreateThanksDto } from './dto/create-thanks.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { Prisma } from '@prisma/client';

type SightingRow = {
  avistamiento_id: string;
  mascota_id: string;
  mensaje_rescatista: string | null;
  foto_evidencia_url: string | null;
  fecha_avistamiento: Date;
  lat: number;
  lng: number;
};

type CommentRow = {
  comentario_id: string;
  avistamiento_id: string;
  autor_usuario_id: string | null;
  reply_to_user_id: string | null;
  mensaje: string;
  foto_url: string | null;
  lat: number | null;
  lng: number | null;
  creado_el: Date;
  autor_nombre: string | null;
  autor_apellido: string | null;
  autor_foto_perfil: string | null;
};

@Injectable()
export class SightingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
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

    const result = await this.findSighting(row.avistamiento_id);

    // Notificar al dueño
    void this.notifications.sendSightingAlert(mascotaId);
    this.realtime.emitSightingNew(mascotaId, {
      avistamientoId: result.avistamientoId,
      lat: result.lat,
      lng: result.lng,
      fotoUrl: result.fotoEvidenciaUrl,
      mensaje: result.mensajeRescatista,
      fechaAvistamiento: result.fechaAvistamiento,
    });

    return result;
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

  async createComment(
    avistamientoId: string,
    usuarioId: string,
    dto: CreateCommentDto,
    file?: Express.Multer.File,
  ) {
    const avistamiento = await this.prisma.avistamiento.findUnique({
      where: { avistamientoId },
      select: { avistamientoId: true, mascotaId: true },
    });
    if (!avistamiento) throw new NotFoundException('Avistamiento no encontrado');

    let fotoUrl: string | null = null;
    if (file) {
      const result = await this.cloudinary.uploadBuffer(
        file.buffer,
        `comentarios-avistamiento/${avistamientoId}`,
      );
      fotoUrl = result.secure_url;
    }

    // Solo guardar GPS si hay foto (regla de privacidad)
    const tieneGps = fotoUrl !== null && dto.lat != null && dto.lng != null;

    const replyToSql = dto.replyToUserId
      ? Prisma.sql`${dto.replyToUserId}::uuid`
      : Prisma.sql`NULL`;

    const [row] = await this.prisma.$queryRaw<Array<{ comentario_id: string }>>`
      INSERT INTO comentarios_avistamiento
        (avistamiento_id, autor_usuario_id, reply_to_user_id, mensaje, foto_url, ubicacion_gps)
      VALUES (
        ${avistamientoId}::uuid,
        ${usuarioId}::uuid,
        ${replyToSql},
        ${dto.mensaje},
        ${fotoUrl},
        ${tieneGps ? Prisma.sql`ST_SetSRID(ST_MakePoint(${dto.lng!}, ${dto.lat!}), 4326)` : Prisma.sql`NULL`}
      )
      RETURNING comentario_id
    `;

    const comment = await this.findComment(row.comentario_id);

    if (avistamiento.mascotaId) {
      void this.notifications.sendSightingCommentAlert(avistamiento.mascotaId, avistamientoId);
      this.realtime.emitSightingCommentNew(avistamiento.mascotaId, {
        comentarioId: comment.comentarioId,
        avistamientoId,
        mensaje: comment.mensaje,
        fotoUrl: comment.fotoUrl,
        lat: comment.lat ?? undefined,
        lng: comment.lng ?? undefined,
        creadoEl: comment.creadoEl,
      });
    }

    return comment;
  }

  async getComments(avistamientoId: string, usuarioId: string) {
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

    // Propietario ve todo; comentarista solo ve su hilo bilateral con el dueño
    const whereClause = esPropietario
      ? Prisma.sql`c.avistamiento_id = ${avistamientoId}::uuid`
      : Prisma.sql`c.avistamiento_id = ${avistamientoId}::uuid
          AND (c.autor_usuario_id = ${usuarioId}::uuid OR c.reply_to_user_id = ${usuarioId}::uuid)`;

    const rows = await this.prisma.$queryRaw<CommentRow[]>`
      SELECT
        c.comentario_id,
        c.avistamiento_id,
        c.autor_usuario_id,
        c.reply_to_user_id,
        c.mensaje,
        c.foto_url,
        CASE WHEN c.ubicacion_gps IS NOT NULL THEN ST_Y(c.ubicacion_gps::geometry) END AS lat,
        CASE WHEN c.ubicacion_gps IS NOT NULL THEN ST_X(c.ubicacion_gps::geometry) END AS lng,
        c.creado_el,
        p.nombre AS autor_nombre,
        p.apellido_paterno AS autor_apellido,
        p.foto_perfil_url AS autor_foto_perfil
      FROM comentarios_avistamiento c
      LEFT JOIN usuarios u ON u.usuario_id = c.autor_usuario_id
      LEFT JOIN personas p ON p.persona_id = u.persona_id
      WHERE ${whereClause}
      ORDER BY c.creado_el ASC
    `;

    return rows.map((r) => this.mapCommentRow(r));
  }

  async createRating(avistamientoId: string, usuarioId: string, dto: CreateRatingDto) {
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
    if (!esPropietario)
      throw new ForbiddenException('Solo el dueño puede calificar el avistamiento');

    const rating = await this.prisma.calificacionAvistamiento.upsert({
      where: { avistamientoId },
      update: { confirmado: dto.confirmado, estrellas: dto.estrellas, autorUsuarioId: usuarioId },
      create: {
        avistamientoId,
        autorUsuarioId: usuarioId,
        confirmado: dto.confirmado,
        estrellas: dto.estrellas,
      },
    });

    if (avistamiento.mascotaId) {
      this.realtime.emitSightingRated(avistamiento.mascotaId, {
        avistamientoId,
        confirmado: dto.confirmado,
        estrellas: dto.estrellas,
      });
    }

    return rating;
  }

  async getRating(avistamientoId: string) {
    const avistamiento = await this.prisma.avistamiento.findUnique({
      where: { avistamientoId },
    });
    if (!avistamiento) throw new NotFoundException('Avistamiento no encontrado');

    return this.prisma.calificacionAvistamiento.findUnique({ where: { avistamientoId } });
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

  private async findComment(comentarioId: string) {
    const rows = await this.prisma.$queryRaw<CommentRow[]>`
      SELECT
        c.comentario_id,
        c.avistamiento_id,
        c.autor_usuario_id,
        c.reply_to_user_id,
        c.mensaje,
        c.foto_url,
        CASE WHEN c.ubicacion_gps IS NOT NULL THEN ST_Y(c.ubicacion_gps::geometry) END AS lat,
        CASE WHEN c.ubicacion_gps IS NOT NULL THEN ST_X(c.ubicacion_gps::geometry) END AS lng,
        c.creado_el,
        p.nombre AS autor_nombre,
        p.apellido_paterno AS autor_apellido,
        p.foto_perfil_url AS autor_foto_perfil
      FROM comentarios_avistamiento c
      LEFT JOIN usuarios u ON u.usuario_id = c.autor_usuario_id
      LEFT JOIN personas p ON p.persona_id = u.persona_id
      WHERE c.comentario_id = ${comentarioId}::uuid
    `;
    if (!rows.length) throw new NotFoundException('Comentario no encontrado');
    return this.mapCommentRow(rows[0]);
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

  private mapCommentRow(r: CommentRow) {
    return {
      comentarioId: r.comentario_id,
      avistamientoId: r.avistamiento_id,
      autorUsuarioId: r.autor_usuario_id,
      replyToUserId: r.reply_to_user_id,
      mensaje: r.mensaje,
      fotoUrl: r.foto_url,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      creadoEl: r.creado_el,
      autor: r.autor_nombre
        ? {
            nombre: r.autor_nombre,
            apellidoPaterno: r.autor_apellido,
            fotoPerfilUrl: r.autor_foto_perfil,
          }
        : null,
    };
  }

  private async checkPetAccess(mascotaId: string, personaId: string) {
    const rel = await this.prisma.propietarioMascota.findUnique({
      where: { personaId_mascotaId: { personaId, mascotaId } },
    });
    if (!rel) throw new ForbiddenException('No tienes acceso a esta mascota');
  }
}
