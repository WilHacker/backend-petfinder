import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { SendMessageDto } from './dto/send-message.dto';

type MensajeRow = {
  mensaje_id: string;
  conversacion_id: string;
  autor_usuario_id: string | null;
  contenido: string | null;
  foto_url: string | null;
  lat: number | null;
  lng: number | null;
  creado_el: Date;
  leido_el: Date | null;
  autor_nombre: string | null;
  autor_apellido: string | null;
  autor_foto_url: string | null;
};

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly realtime: RealtimeService,
  ) {}

  // ─── Iniciar chat (llamado desde sightings) ───────────────────────────────

  async initChat(avistamientoId: string, duenoUsuarioId: string) {
    const avistamiento = await this.prisma.avistamiento.findUnique({
      where: { avistamientoId },
      include: {
        mascota: {
          include: {
            propietarios: { include: { persona: { include: { usuario: true } } } },
            fotos: { where: { esPrincipal: true }, take: 1 },
          },
        },
      },
    });
    if (!avistamiento) throw new NotFoundException('Avistamiento no encontrado');
    if (!avistamiento.mascota) throw new NotFoundException('Mascota no encontrada');
    if (!avistamiento.rescatistaUsuarioId) {
      throw new BadRequestException(
        'Este avistamiento fue creado sin cuenta — no es posible iniciar un chat privado',
      );
    }

    const esPropietario = avistamiento.mascota.propietarios.some(
      (p) => p.persona.usuario?.usuarioId === duenoUsuarioId,
    );
    if (!esPropietario) throw new ForbiddenException('Solo el dueño puede iniciar el chat');

    if (avistamiento.rescatistaUsuarioId === duenoUsuarioId) {
      throw new BadRequestException('No puedes iniciar un chat contigo mismo');
    }

    const mascotaId = avistamiento.mascotaId!;
    const rescatistaUsuarioId = avistamiento.rescatistaUsuarioId;

    // Buscar conversación existente (UNIQUE por mascota+dueno+rescatista)
    const existing = await this.prisma.conversacionPrivada.findUnique({
      where: {
        mascotaId_duenoUsuarioId_rescatistaUsuarioId: {
          mascotaId,
          duenoUsuarioId,
          rescatistaUsuarioId,
        },
      },
    });

    if (existing) {
      if (existing.estado === 'aceptada') {
        return {
          conversacionId: existing.conversacionId,
          estado: 'aceptada',
          mensaje: 'El chat ya está activo',
        };
      }
      if (existing.intentos >= existing.maxIntentos) {
        throw new ForbiddenException(
          `Has alcanzado el límite de ${existing.maxIntentos} invitaciones para esta mascota`,
        );
      }
      // Reintentar: incrementar intentos y volver a pendiente
      const updated = await this.prisma.conversacionPrivada.update({
        where: { conversacionId: existing.conversacionId },
        data: { estado: 'pendiente', intentos: { increment: 1 } },
      });
      await this.emitirInvitacion(
        updated.conversacionId,
        avistamiento.mascota,
        duenoUsuarioId,
        rescatistaUsuarioId,
        updated.maxIntentos - updated.intentos,
      );
      return { conversacionId: updated.conversacionId, estado: 'pendiente' };
    }

    // Nueva conversación
    const nueva = await this.prisma.conversacionPrivada.create({
      data: {
        mascotaId,
        avistamientoOrigenId: avistamientoId,
        duenoUsuarioId,
        rescatistaUsuarioId,
        estado: 'pendiente',
        intentos: 1,
        maxIntentos: 2,
      },
    });

    await this.emitirInvitacion(
      nueva.conversacionId,
      avistamiento.mascota,
      duenoUsuarioId,
      rescatistaUsuarioId,
      nueva.maxIntentos - nueva.intentos,
    );
    return { conversacionId: nueva.conversacionId, estado: 'pendiente' };
  }

  // ─── Aceptar ──────────────────────────────────────────────────────────────

  async acceptChat(conversacionId: string, usuarioId: string) {
    const conv = await this.findConvOrFail(conversacionId);
    if (conv.rescatistaUsuarioId !== usuarioId) {
      throw new ForbiddenException('Solo el rescatista puede aceptar la invitación');
    }
    if (conv.estado !== 'pendiente') {
      throw new BadRequestException(`La invitación ya fue ${conv.estado}`);
    }

    await this.prisma.conversacionPrivada.update({
      where: { conversacionId },
      data: { estado: 'aceptada' },
    });

    // Obtener datos del rescatista para notificar al dueño
    const rescatista = await this.getPersonaDeUsuario(usuarioId);
    this.realtime.emitChatAccepted(conv.duenoUsuarioId, {
      conversacionId,
      rescatista: {
        nombre: rescatista.nombre,
        apellido: rescatista.apellidoPaterno,
        fotoUrl: rescatista.fotoPerfilUrl,
      },
    });

    // Unir al rescatista al room del chat (el dueño se une en su próxima conexión o ya está)
    this.realtime.joinChatRoom(conv.duenoUsuarioId, conversacionId);
    this.realtime.joinChatRoom(usuarioId, conversacionId);

    return { ok: true, conversacionId };
  }

  // ─── Rechazar ─────────────────────────────────────────────────────────────

  async declineChat(conversacionId: string, usuarioId: string) {
    const conv = await this.findConvOrFail(conversacionId);
    if (conv.rescatistaUsuarioId !== usuarioId) {
      throw new ForbiddenException('Solo el rescatista puede rechazar la invitación');
    }
    if (conv.estado !== 'pendiente') {
      throw new BadRequestException(`La invitación ya fue ${conv.estado}`);
    }

    const updated = await this.prisma.conversacionPrivada.update({
      where: { conversacionId },
      data: { estado: 'rechazada' },
    });

    const intentosRestantes = updated.maxIntentos - updated.intentos;
    this.realtime.emitChatDeclined(conv.duenoUsuarioId, { conversacionId, intentosRestantes });

    return { ok: true, conversacionId, intentosRestantes };
  }

  // ─── Enviar mensaje ───────────────────────────────────────────────────────

  async sendMessage(
    conversacionId: string,
    usuarioId: string,
    dto: SendMessageDto,
    file?: Express.Multer.File,
  ) {
    const conv = await this.findConvOrFail(conversacionId);
    if (conv.estado !== 'aceptada') {
      throw new BadRequestException('El chat no está activo');
    }
    const esParticipante =
      conv.duenoUsuarioId === usuarioId || conv.rescatistaUsuarioId === usuarioId;
    if (!esParticipante) throw new ForbiddenException('No eres participante de este chat');

    if (!file && !dto.contenido && dto.lat == null) {
      throw new BadRequestException('Debes enviar al menos un mensaje, foto o ubicación');
    }

    let fotoUrl: string | null = null;
    if (file) {
      const result = await this.cloudinary.uploadBuffer(file.buffer, `chats/${conversacionId}`);
      fotoUrl = result.secure_url;
    }

    const tieneGps = dto.lat != null && dto.lng != null;

    const [row] = await this.prisma.$queryRaw<Array<{ mensaje_id: string }>>`
      INSERT INTO mensajes_chat
        (conversacion_id, autor_usuario_id, contenido, foto_url, ubicacion_gps)
      VALUES (
        ${conversacionId}::uuid,
        ${usuarioId}::uuid,
        ${dto.contenido ?? null},
        ${fotoUrl},
        ${tieneGps ? Prisma.sql`ST_SetSRID(ST_MakePoint(${dto.lng!}, ${dto.lat!}), 4326)` : Prisma.sql`NULL`}
      )
      RETURNING mensaje_id
    `;

    const mensaje = await this.findMensaje(row.mensaje_id);
    const autor = await this.getPersonaDeUsuario(usuarioId);

    this.realtime.emitChatMessage(conversacionId, {
      mensajeId: mensaje.mensajeId,
      conversacionId,
      autorUsuarioId: usuarioId,
      autorNombre: `${autor.nombre} ${autor.apellidoPaterno}`,
      autorFotoUrl: autor.fotoPerfilUrl,
      contenido: mensaje.contenido,
      fotoUrl: mensaje.fotoUrl,
      lat: mensaje.lat,
      lng: mensaje.lng,
      creadoEl: mensaje.creadoEl,
    });

    // Calcular no leídos para el otro participante y notificar
    const otroUsuarioId =
      usuarioId === conv.duenoUsuarioId ? conv.rescatistaUsuarioId : conv.duenoUsuarioId;
    const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count FROM mensajes_chat
      WHERE conversacion_id = ${conversacionId}::uuid
        AND autor_usuario_id != ${otroUsuarioId}::uuid
        AND leido_el IS NULL
    `;
    this.realtime.emitChatUnreadCount(conversacionId, {
      conversacionId,
      noLeidos: Number(count),
    });

    return mensaje;
  }

  // ─── Obtener mensajes ─────────────────────────────────────────────────────

  async getMessages(conversacionId: string, usuarioId: string) {
    const conv = await this.findConvOrFail(conversacionId);
    const esParticipante =
      conv.duenoUsuarioId === usuarioId || conv.rescatistaUsuarioId === usuarioId;
    if (!esParticipante) throw new ForbiddenException('No eres participante de este chat');

    const rows = await this.prisma.$queryRaw<MensajeRow[]>`
      SELECT
        m.mensaje_id,
        m.conversacion_id,
        m.autor_usuario_id,
        m.contenido,
        m.foto_url,
        CASE WHEN m.ubicacion_gps IS NOT NULL THEN ST_Y(m.ubicacion_gps::geometry) END AS lat,
        CASE WHEN m.ubicacion_gps IS NOT NULL THEN ST_X(m.ubicacion_gps::geometry) END AS lng,
        m.creado_el,
        m.leido_el,
        p.nombre        AS autor_nombre,
        p.apellido_paterno AS autor_apellido,
        p.foto_perfil_url  AS autor_foto_url
      FROM mensajes_chat m
      LEFT JOIN usuarios u  ON u.usuario_id = m.autor_usuario_id
      LEFT JOIN personas p  ON p.persona_id = u.persona_id
      WHERE m.conversacion_id = ${conversacionId}::uuid
      ORDER BY m.creado_el ASC
    `;

    return rows.map((r) => this.mapMensajeRow(r));
  }

  // ─── Marcar como leído ────────────────────────────────────────────────────

  async markAsRead(conversacionId: string, usuarioId: string) {
    const conv = await this.findConvOrFail(conversacionId);
    const esParticipante =
      conv.duenoUsuarioId === usuarioId || conv.rescatistaUsuarioId === usuarioId;
    if (!esParticipante) throw new ForbiddenException('No eres participante de este chat');

    await this.prisma.$executeRaw`
      UPDATE mensajes_chat
      SET leido_el = NOW()
      WHERE conversacion_id = ${conversacionId}::uuid
        AND autor_usuario_id != ${usuarioId}::uuid
        AND leido_el IS NULL
    `;

    this.realtime.emitChatUnreadCount(conversacionId, { conversacionId, noLeidos: 0 });
    return { ok: true };
  }

  // ─── Listar mis chats ─────────────────────────────────────────────────────

  async getMyChats(usuarioId: string) {
    type ChatRow = {
      conversacion_id: string;
      estado: string;
      mascota_id: string;
      mascota_nombre: string;
      mascota_foto_url: string | null;
      otro_nombre: string | null;
      otro_apellido: string | null;
      otro_foto_url: string | null;
      ultimo_mensaje: string | null;
      ultima_actividad: Date | null;
      no_leidos: bigint;
      soy_dueno: boolean;
    };

    const rows = await this.prisma.$queryRaw<ChatRow[]>`
      SELECT
        c.conversacion_id::text,
        c.estado,
        m.mascota_id::text,
        m.nombre                AS mascota_nombre,
        (SELECT foto_url FROM fotos_mascota
         WHERE mascota_id = m.mascota_id AND es_principal = true LIMIT 1) AS mascota_foto_url,
        otro_p.nombre           AS otro_nombre,
        otro_p.apellido_paterno AS otro_apellido,
        otro_p.foto_perfil_url  AS otro_foto_url,
        (SELECT msg.contenido FROM mensajes_chat msg
         WHERE msg.conversacion_id = c.conversacion_id
         ORDER BY msg.creado_el DESC LIMIT 1)   AS ultimo_mensaje,
        (SELECT MAX(msg2.creado_el) FROM mensajes_chat msg2
         WHERE msg2.conversacion_id = c.conversacion_id) AS ultima_actividad,
        (SELECT COUNT(*) FROM mensajes_chat msg3
         WHERE msg3.conversacion_id = c.conversacion_id
           AND msg3.autor_usuario_id != ${usuarioId}::uuid
           AND msg3.leido_el IS NULL)            AS no_leidos,
        (c.dueno_usuario_id = ${usuarioId}::uuid) AS soy_dueno
      FROM conversaciones_privadas c
      JOIN mascotas m ON m.mascota_id = c.mascota_id
      JOIN usuarios otro_u ON otro_u.usuario_id = CASE
        WHEN c.dueno_usuario_id = ${usuarioId}::uuid THEN c.rescatista_usuario_id
        ELSE c.dueno_usuario_id
      END
      JOIN personas otro_p ON otro_p.persona_id = otro_u.persona_id
      WHERE c.dueno_usuario_id = ${usuarioId}::uuid
         OR c.rescatista_usuario_id = ${usuarioId}::uuid
      ORDER BY ultima_actividad DESC NULLS LAST
    `;

    return rows.map((r) => ({
      conversacionId: r.conversacion_id,
      estado: r.estado,
      soyDueno: r.soy_dueno,
      mascota: {
        mascotaId: r.mascota_id,
        nombre: r.mascota_nombre,
        fotoUrl: r.mascota_foto_url,
      },
      otroParticipante: {
        nombre: r.otro_nombre,
        apellidoPaterno: r.otro_apellido,
        fotoUrl: r.otro_foto_url,
      },
      ultimoMensaje: r.ultimo_mensaje,
      ultimaActividad: r.ultima_actividad,
      noLeidos: Number(r.no_leidos),
    }));
  }

  // ─── Detalle del chat (perfiles de ambos) ─────────────────────────────────

  async getChatDetail(conversacionId: string, usuarioId: string) {
    const conv = await this.prisma.conversacionPrivada.findUnique({
      where: { conversacionId },
      include: {
        mascota: { include: { fotos: { where: { esPrincipal: true }, take: 1 } } },
        dueno: { include: { persona: true } },
        rescatista: { include: { persona: true } },
      },
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const esParticipante =
      conv.duenoUsuarioId === usuarioId || conv.rescatistaUsuarioId === usuarioId;
    if (!esParticipante) throw new ForbiddenException('No eres participante de este chat');

    return {
      conversacionId: conv.conversacionId,
      estado: conv.estado,
      intentos: conv.intentos,
      maxIntentos: conv.maxIntentos,
      mascota: {
        mascotaId: conv.mascota.mascotaId,
        nombre: conv.mascota.nombre,
        fotoUrl: conv.mascota.fotos[0]?.fotoUrl ?? null,
      },
      dueno: {
        usuarioId: conv.duenoUsuarioId,
        nombre: conv.dueno.persona.nombre,
        apellidoPaterno: conv.dueno.persona.apellidoPaterno,
        fotoUrl: conv.dueno.persona.fotoPerfilUrl,
      },
      rescatista: {
        usuarioId: conv.rescatistaUsuarioId,
        nombre: conv.rescatista.persona.nombre,
        apellidoPaterno: conv.rescatista.persona.apellidoPaterno,
        fotoUrl: conv.rescatista.persona.fotoPerfilUrl,
      },
    };
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async findConvOrFail(conversacionId: string) {
    const conv = await this.prisma.conversacionPrivada.findUnique({ where: { conversacionId } });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    return conv;
  }

  private async findMensaje(mensajeId: string) {
    const rows = await this.prisma.$queryRaw<MensajeRow[]>`
      SELECT
        m.mensaje_id,
        m.conversacion_id,
        m.autor_usuario_id,
        m.contenido,
        m.foto_url,
        CASE WHEN m.ubicacion_gps IS NOT NULL THEN ST_Y(m.ubicacion_gps::geometry) END AS lat,
        CASE WHEN m.ubicacion_gps IS NOT NULL THEN ST_X(m.ubicacion_gps::geometry) END AS lng,
        m.creado_el,
        m.leido_el,
        p.nombre           AS autor_nombre,
        p.apellido_paterno AS autor_apellido,
        p.foto_perfil_url  AS autor_foto_url
      FROM mensajes_chat m
      LEFT JOIN usuarios u ON u.usuario_id = m.autor_usuario_id
      LEFT JOIN personas p ON p.persona_id = u.persona_id
      WHERE m.mensaje_id = ${mensajeId}::uuid
    `;
    if (!rows.length) throw new NotFoundException('Mensaje no encontrado');
    return this.mapMensajeRow(rows[0]);
  }

  private async getPersonaDeUsuario(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
      include: { persona: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario.persona;
  }

  private async emitirInvitacion(
    conversacionId: string,
    mascota: { mascotaId: string; nombre: string; fotos: Array<{ fotoUrl: string }> },
    duenoUsuarioId: string,
    rescatistaUsuarioId: string,
    intentosRestantes: number,
  ) {
    const dueno = await this.getPersonaDeUsuario(duenoUsuarioId);
    this.realtime.emitChatInvite(rescatistaUsuarioId, {
      conversacionId,
      mascota: {
        mascotaId: mascota.mascotaId,
        nombre: mascota.nombre,
        fotoUrl: mascota.fotos[0]?.fotoUrl ?? null,
      },
      dueno: {
        nombre: dueno.nombre,
        apellido: dueno.apellidoPaterno,
        fotoUrl: dueno.fotoPerfilUrl,
      },
      intentosRestantes,
    });
  }

  private mapMensajeRow(r: MensajeRow) {
    return {
      mensajeId: r.mensaje_id,
      conversacionId: r.conversacion_id,
      autorUsuarioId: r.autor_usuario_id,
      contenido: r.contenido,
      fotoUrl: r.foto_url,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      creadoEl: r.creado_el,
      leidoEl: r.leido_el,
      autor: r.autor_nombre
        ? {
            nombre: r.autor_nombre,
            apellidoPaterno: r.autor_apellido,
            fotoPerfilUrl: r.autor_foto_url,
          }
        : null,
    };
  }
}
