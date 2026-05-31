import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { NotificationsService } from '../../infrastructure/notifications/notifications.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { CreateSightingDto } from './dto/create-sighting.dto';
import { CreateThanksDto } from './dto/create-thanks.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
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
  mensaje: string | null;
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

    if (!file && !dto.mensaje) {
      throw new BadRequestException('Debes enviar al menos un mensaje o una foto');
    }

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
        ${dto.mensaje ?? null},
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

  // ─── threads / participations ─────────────────────────────────────────────

  async markAsRead(avistamientoId: string, usuarioId: string) {
    const avistamiento = await this.prisma.avistamiento.findUnique({ where: { avistamientoId } });
    if (!avistamiento) throw new NotFoundException('Avistamiento no encontrado');

    await this.prisma.lecturaComentario.upsert({
      where: { usuarioId_avistamientoId: { usuarioId, avistamientoId } },
      update: { leidoHastaEl: new Date() },
      create: { usuarioId, avistamientoId, leidoHastaEl: new Date() },
    });

    return { ok: true };
  }

  async getMyPetsThreads(usuarioId: string) {
    type Row = {
      mascota_id: string;
      mascota_nombre: string;
      mascota_estado: string | null;
      mascota_foto_url: string | null;
      avistamiento_id: string | null;
      fecha_avistamiento: Date | null;
      total_hilos: bigint | null;
      ultima_actividad: Date | null;
      ultimo_mensaje: string | null;
      no_leidos: bigint | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        m.mascota_id::text,
        m.nombre          AS mascota_nombre,
        m.estado::text    AS mascota_estado,
        (
          SELECT foto_url FROM fotos_mascota
          WHERE mascota_id = m.mascota_id AND es_principal = true
          LIMIT 1
        )                 AS mascota_foto_url,
        la.avistamiento_id::text,
        la.fecha_avistamiento,
        la.total_hilos,
        la.ultima_actividad,
        la.ultimo_mensaje,
        la.no_leidos
      FROM mascotas m
      JOIN propietarios_mascota pm ON pm.mascota_id = m.mascota_id
      JOIN personas p              ON p.persona_id  = pm.persona_id
      JOIN usuarios u              ON u.persona_id  = p.persona_id
      LEFT JOIN LATERAL (
        SELECT
          a.avistamiento_id,
          a.fecha_avistamiento,
          COUNT(DISTINCT
            CASE
              WHEN c.reply_to_user_id IS NULL
               AND c.autor_usuario_id != ${usuarioId}::uuid
              THEN c.autor_usuario_id
            END
          )                AS total_hilos,
          MAX(c.creado_el) AS ultima_actividad,
          (
            SELECT cm.mensaje
            FROM comentarios_avistamiento cm
            WHERE cm.avistamiento_id = a.avistamiento_id
            ORDER BY cm.creado_el DESC
            LIMIT 1
          )                AS ultimo_mensaje,
          (
            SELECT COUNT(*) FROM comentarios_avistamiento c_unread
            WHERE c_unread.avistamiento_id = a.avistamiento_id
              AND c_unread.autor_usuario_id != ${usuarioId}::uuid
              AND c_unread.creado_el > COALESCE(
                (SELECT leido_hasta_el FROM lecturas_comentarios
                 WHERE usuario_id = ${usuarioId}::uuid AND avistamiento_id = a.avistamiento_id),
                '1970-01-01'::timestamptz
              )
          )                AS no_leidos
        FROM avistamientos a
        LEFT JOIN comentarios_avistamiento c ON c.avistamiento_id = a.avistamiento_id
        WHERE a.mascota_id = m.mascota_id
        GROUP BY a.avistamiento_id, a.fecha_avistamiento
        ORDER BY MAX(c.creado_el) DESC NULLS LAST
        LIMIT 1
      ) la ON true
      WHERE u.usuario_id = ${usuarioId}::uuid
      ORDER BY la.ultima_actividad DESC NULLS LAST
    `;

    return rows.map((r) => ({
      mascota: {
        mascotaId: r.mascota_id,
        nombre: r.mascota_nombre,
        estado: r.mascota_estado,
        fotoUrl: r.mascota_foto_url,
      },
      avistamiento: r.avistamiento_id
        ? {
            avistamientoId: r.avistamiento_id,
            fechaAvistamiento: r.fecha_avistamiento,
            totalHilos: Number(r.total_hilos ?? 0),
            ultimaActividad: r.ultima_actividad,
            ultimoMensaje: r.ultimo_mensaje,
            noLeidos: Number(r.no_leidos ?? 0),
          }
        : null,
    }));
  }

  async getMyParticipations(usuarioId: string) {
    type Row = {
      avistamiento_id: string;
      mascota_id: string;
      mascota_nombre: string;
      mascota_estado: string | null;
      mascota_foto_url: string | null;
      dueno_nombre: string | null;
      dueno_foto_perfil_url: string | null;
      mi_ultimo_mensaje: string | null;
      ultima_respuesta: string | null;
      ultima_actividad: Date | null;
      no_leidos: bigint;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        a.avistamiento_id::text,
        m.mascota_id::text,
        m.nombre            AS mascota_nombre,
        m.estado::text      AS mascota_estado,
        (
          SELECT foto_url FROM fotos_mascota
          WHERE mascota_id = m.mascota_id AND es_principal = true
          LIMIT 1
        )                   AS mascota_foto_url,
        dueno.nombre        AS dueno_nombre,
        dueno.foto_perfil_url AS dueno_foto_perfil_url,
        (
          SELECT cm.mensaje
          FROM comentarios_avistamiento cm
          WHERE cm.avistamiento_id = a.avistamiento_id
            AND cm.autor_usuario_id = ${usuarioId}::uuid
          ORDER BY cm.creado_el DESC
          LIMIT 1
        )                   AS mi_ultimo_mensaje,
        (
          SELECT cr.mensaje
          FROM comentarios_avistamiento cr
          WHERE cr.avistamiento_id = a.avistamiento_id
            AND cr.reply_to_user_id = ${usuarioId}::uuid
          ORDER BY cr.creado_el DESC
          LIMIT 1
        )                   AS ultima_respuesta,
        GREATEST(
          (SELECT MAX(cm2.creado_el) FROM comentarios_avistamiento cm2
           WHERE cm2.avistamiento_id = a.avistamiento_id AND cm2.autor_usuario_id = ${usuarioId}::uuid),
          (SELECT MAX(cr2.creado_el) FROM comentarios_avistamiento cr2
           WHERE cr2.avistamiento_id = a.avistamiento_id AND cr2.reply_to_user_id = ${usuarioId}::uuid)
        )                   AS ultima_actividad,
        (
          SELECT COUNT(*) FROM comentarios_avistamiento c_unread
          WHERE c_unread.avistamiento_id = a.avistamiento_id
            AND c_unread.reply_to_user_id = ${usuarioId}::uuid
            AND c_unread.creado_el > COALESCE(
              (SELECT leido_hasta_el FROM lecturas_comentarios
               WHERE usuario_id = ${usuarioId}::uuid AND avistamiento_id = a.avistamiento_id),
              '1970-01-01'::timestamptz
            )
        )                   AS no_leidos
      FROM avistamientos a
      JOIN mascotas m ON m.mascota_id = a.mascota_id
      LEFT JOIN LATERAL (
        SELECT p2.nombre, p2.foto_perfil_url
        FROM propietarios_mascota pm2
        JOIN personas p2 ON p2.persona_id = pm2.persona_id
        WHERE pm2.mascota_id = m.mascota_id
        ORDER BY CASE WHEN pm2.tipo_relacion::text = 'Dueño Principal' THEN 0 ELSE 1 END
        LIMIT 1
      ) dueno ON true
      WHERE EXISTS (
        SELECT 1 FROM comentarios_avistamiento
        WHERE avistamiento_id = a.avistamiento_id
          AND autor_usuario_id = ${usuarioId}::uuid
      )
      ORDER BY ultima_actividad DESC NULLS LAST
    `;

    return rows.map((r) => ({
      avistamientoId: r.avistamiento_id,
      mascota: {
        mascotaId: r.mascota_id,
        nombre: r.mascota_nombre,
        estado: r.mascota_estado,
        fotoUrl: r.mascota_foto_url,
      },
      dueno: {
        nombre: r.dueno_nombre,
        fotoPerfilUrl: r.dueno_foto_perfil_url,
      },
      miUltimoMensaje: r.mi_ultimo_mensaje,
      ultimaRespuesta: r.ultima_respuesta,
      ultimaActividad: r.ultima_actividad,
      noLeidos: Number(r.no_leidos ?? 0),
    }));
  }

  async getUnreadCount(usuarioId: string) {
    const [dueno] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM comentarios_avistamiento c
      JOIN avistamientos a ON a.avistamiento_id = c.avistamiento_id
      JOIN mascotas m      ON m.mascota_id = a.mascota_id
      JOIN propietarios_mascota pm ON pm.mascota_id = m.mascota_id
      JOIN personas p      ON p.persona_id = pm.persona_id
      JOIN usuarios u      ON u.persona_id = p.persona_id
      WHERE u.usuario_id = ${usuarioId}::uuid
        AND c.autor_usuario_id != ${usuarioId}::uuid
        AND c.creado_el > COALESCE(
          (SELECT lc.leido_hasta_el FROM lecturas_comentarios lc
           WHERE lc.usuario_id = ${usuarioId}::uuid
             AND lc.avistamiento_id = a.avistamiento_id),
          '1970-01-01'::timestamptz
        )
    `;

    const [rescatista] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM comentarios_avistamiento c
      WHERE c.reply_to_user_id = ${usuarioId}::uuid
        AND c.creado_el > COALESCE(
          (SELECT lc.leido_hasta_el FROM lecturas_comentarios lc
           WHERE lc.usuario_id = ${usuarioId}::uuid
             AND lc.avistamiento_id = c.avistamiento_id),
          '1970-01-01'::timestamptz
        )
    `;

    const comoDueno = Number(dueno.count);
    const comoRescatista = Number(rescatista.count);

    return { total: comoDueno + comoRescatista, comoDueno, comoRescatista };
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
