import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { NotificationsService } from '../../infrastructure/notifications/notifications.service';
import { ScanDto } from './dto/scan.dto';
import { AddOwnerDto } from './dto/add-owner.dto';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { EstadoMascota, RelacionPropietario } from '@prisma/client';

const MAX_FOTOS = 4;
const MIN_FOTOS = 1;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    personaId: string,
    dto: CreatePetDto,
    files: Express.Multer.File[] = [],
    fotoPrincipalIndex = 0,
  ) {
    if (files.length > MAX_FOTOS)
      throw new BadRequestException(`Máximo ${MAX_FOTOS} fotos permitidas`);

    const invalidType = files.find((f) => !ALLOWED_MIME.includes(f.mimetype));
    if (invalidType)
      throw new BadRequestException('Solo se permiten imágenes (jpeg, png, webp, gif)');

    const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) throw new BadRequestException('Cada imagen debe pesar menos de 5 MB');

    if (files.length > 0 && fotoPrincipalIndex >= files.length)
      throw new BadRequestException(
        `fotoPrincipalIndex (${fotoPrincipalIndex}) excede el número de fotos subidas (${files.length})`,
      );

    // 1. Crear mascota + placa QR en transacción (batch — compatible con driver adapters de Prisma 7)
    const mascotaId = randomUUID();
    const [mascota, placa] = await this.prisma.$transaction([
      this.prisma.mascota.create({
        data: {
          mascotaId,
          nombre: dto.nombre,
          tipoId: dto.tipoId,
          sexo: dto.sexo,
          colorPrimario: dto.colorPrimario,
          rasgosParticulares: dto.rasgosParticulares,
          propietarios: {
            create: {
              personaId,
              tipoRelacion: RelacionPropietario.Dueno_Principal,
              recibeAlertas: true,
              mostrarEnQr: true,
            },
          },
        },
        include: { propietarios: true },
      }),
      this.prisma.placaQr.create({
        data: { mascotaId },
      }),
    ]);

    // 2. Subir fotos a Cloudinary e insertar en BD (fuera de la transacción de BD)
    let fotos: { fotoId: number; fotoUrl: string; esPrincipal: boolean | null }[] = [];
    if (files.length > 0) {
      const uploads = await Promise.all(
        files.map((f) => this.cloudinary.uploadBuffer(f.buffer, `mascotas/${mascotaId}`)),
      );
      fotos = await this.prisma.$transaction(
        uploads.map((upload, i) =>
          this.prisma.fotoMascota.create({
            data: {
              mascotaId,
              fotoUrl: upload.secure_url,
              esPrincipal: i === fotoPrincipalIndex,
            },
          }),
        ),
      );
    }

    // 3. Busca usuarioId del creador para emitir WS al room personal
    const usuario = await this.prisma.usuario.findUnique({
      where: { personaId },
      select: { usuarioId: true },
    });

    const fotoPrincipalUrl = fotos.find((f) => f.esPrincipal)?.fotoUrl ?? fotos[0]?.fotoUrl ?? null;

    if (usuario) {
      this.realtime.emitPetRegistered(usuario.usuarioId, {
        mascotaId,
        nombre: dto.nombre,
        estado: mascota.estado ?? 'en_casa',
        fotoPrincipalUrl,
      });
    }

    return { ...mascota, placaQr: placa, fotos };
  }

  async findMyPets(personaId: string) {
    return this.prisma.mascota.findMany({
      where: {
        propietarios: { some: { personaId } },
      },
      include: {
        tipoMascota: true,
        placaQr: { select: { placaId: true, tokenAcceso: true, estaActiva: true } },
        fotos: { where: { esPrincipal: true }, take: 1 },
        propietarios: { include: { persona: true } },
      },
    });
  }

  async findOne(mascotaId: string, personaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: {
        tipoMascota: true,
        placaQr: true,
        fotos: { select: { fotoId: true, fotoUrl: true, esPrincipal: true, creadoEl: true } },
        fichaMedica: true,
        propietarios: { include: { persona: { include: { mediosContacto: true } } } },
      },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const geo = await this.prisma.$queryRaw<Array<{ lat: number | null; lng: number | null }>>`
      SELECT
        ST_Y(ultima_ubicacion_conocida::geometry) AS lat,
        ST_X(ultima_ubicacion_conocida::geometry) AS lng
      FROM mascotas
      WHERE mascota_id = ${mascotaId}::uuid
    `;

    return {
      ...mascota,
      ubicacion: geo[0]?.lat != null ? { lat: geo[0].lat, lng: geo[0].lng } : null,
    };
  }

  async update(mascotaId: string, personaId: string, dto: UpdatePetDto) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const updated = await this.prisma.mascota.update({
      where: { mascotaId },
      data: {
        ...(dto.nombre && { nombre: dto.nombre }),
        ...(dto.tipoId !== undefined && { tipoId: dto.tipoId }),
        ...(dto.sexo !== undefined && { sexo: dto.sexo }),
        ...(dto.colorPrimario !== undefined && { colorPrimario: dto.colorPrimario }),
        ...(dto.rasgosParticulares !== undefined && {
          rasgosParticulares: dto.rasgosParticulares,
        }),
      },
    });

    this.realtime.emitPetProfileUpdated({
      mascotaId,
      nombre: updated.nombre ?? undefined,
      colorPrimario: updated.colorPrimario ?? undefined,
      rasgosParticulares: updated.rasgosParticulares ?? undefined,
      fechaActualizacion: new Date(),
    });

    return updated;
  }

  async remove(mascotaId: string, personaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    await this.prisma.mascota.delete({ where: { mascotaId } });
    return { message: 'Mascota eliminada' };
  }

  async getQr(
    mascotaId: string,
    personaId: string,
    size = 300,
    format: 'svg' | 'png' = 'png',
  ): Promise<string> {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true, placaQr: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);
    if (!mascota.placaQr) throw new NotFoundException('La mascota no tiene placa QR');

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://petfinder.app');
    const url = `${frontendUrl}/scan/${mascota.placaQr.tokenAcceso}`;

    if (format === 'svg') {
      return QRCode.toString(url, { type: 'svg' });
    }

    const clampedSize = Math.min(Math.max(size, 100), 1000);
    return QRCode.toDataURL(url, { width: clampedSize });
  }

  async sendCommunityAlert(
    mascotaId: string,
    personaId: string,
    radio: number,
  ): Promise<{ message: string; usuariosNotificados: number }> {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const count = await this.notifications.sendRadiusAlert(mascotaId, radio);
    return {
      message:
        count > 0
          ? `Alerta enviada a ${count} usuario(s) cercano(s)`
          : 'No hay usuarios cercanos con la app activa en ese radio',
      usuariosNotificados: count,
    };
  }

  async addOwner(mascotaId: string, personaId: string, dto: AddOwnerDto) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const usuarioDestino = await this.prisma.usuario.findUnique({
      where: { correoElectronico: dto.correoElectronico },
      select: { usuarioId: true, personaId: true },
    });
    if (!usuarioDestino)
      throw new NotFoundException('No existe una cuenta con ese correo electrónico');

    const targetPersonaId = usuarioDestino.personaId;

    const yaEsPropietario = mascota.propietarios.some((p) => p.personaId === targetPersonaId);
    if (yaEsPropietario)
      throw new BadRequestException('Esta persona ya es propietaria o cuidadora de la mascota');

    const nuevaRelacion = await this.prisma.propietarioMascota.create({
      data: {
        mascotaId,
        personaId: targetPersonaId,
        tipoRelacion: dto.tipoRelacion ?? RelacionPropietario.Cuidador,
        recibeAlertas: dto.recibeAlertas ?? true,
        mostrarEnQr: dto.mostrarEnQr ?? true,
      },
      include: { persona: true },
    });

    this.realtime.emitOwnerAdded(mascotaId, usuarioDestino.usuarioId, {
      mascotaId,
      personaId: targetPersonaId,
      nombreCompleto:
        `${nuevaRelacion.persona.nombre} ${nuevaRelacion.persona.apellidoPaterno}`.trim(),
      tipoRelacion: nuevaRelacion.tipoRelacion ?? RelacionPropietario.Cuidador,
      fechaAgregado: new Date(),
    });

    return nuevaRelacion;
  }

  async removeOwner(mascotaId: string, personaId: string, targetPersonaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const target = mascota.propietarios.find((p) => p.personaId === targetPersonaId);
    if (!target)
      throw new NotFoundException('El propietario indicado no está asociado a esta mascota');
    if (target.tipoRelacion === RelacionPropietario.Dueno_Principal)
      throw new ForbiddenException('No se puede eliminar al Dueño Principal de la mascota');

    return this.prisma.propietarioMascota.delete({
      where: { personaId_mascotaId: { personaId: targetPersonaId, mascotaId } },
    });
  }

  async updateStatus(mascotaId: string, personaId: string, estado: EstadoMascota) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const actualizada = await this.prisma.mascota.update({
      where: { mascotaId },
      data: { estado },
      select: { mascotaId: true, nombre: true, estado: true },
    });

    if (estado === EstadoMascota.extraviada) {
      // Solo crea el reporte si no hay uno abierto ya
      const reporteAbierto = await this.prisma.reporteExtravio.findFirst({
        where: { mascotaId, estadoReporte: 'abierto' },
        select: { reporteId: true },
      });

      if (!reporteAbierto) {
        // Copia la última ubicación conocida de la mascota al reporte
        await this.prisma.$executeRaw`
          INSERT INTO reportes_extravio (mascota_id, fecha_perdida, ultima_ubicacion_conocida, estado_reporte)
          SELECT
            ${mascotaId}::uuid,
            NOW(),
            ultima_ubicacion_conocida,
            'abierto'
          FROM mascotas
          WHERE mascota_id = ${mascotaId}::uuid
        `;

        // Notificar a propietarios, usuarios con zonas cercanas y usuarios en el radio
        void this.notifications.sendPetLostAlert(mascotaId);
        void this.notifications.sendZoneAlert(mascotaId);
        void this.notifications.sendRadiusAlert(mascotaId);
      }
    } else {
      // Cierra cualquier reporte abierto al recuperar o cambiar estado
      await this.prisma.reporteExtravio.updateMany({
        where: { mascotaId, estadoReporte: 'abierto' },
        data: { estadoReporte: 'cerrado' },
      });
    }

    this.realtime.emitPetStatusChanged({
      mascotaId: actualizada.mascotaId,
      nombre: actualizada.nombre,
      estado: actualizada.estado ?? estado,
      fechaCambio: new Date(),
    });

    return actualizada;
  }

  async updateReward(mascotaId: string, personaId: string, recompensa: number) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const reporteAbierto = await this.prisma.reporteExtravio.findFirst({
      where: { mascotaId, estadoReporte: 'abierto' },
      select: { reporteId: true },
    });
    if (!reporteAbierto)
      throw new BadRequestException('La mascota no está extraviada — no hay reporte activo');

    await this.prisma.reporteExtravio.update({
      where: { reporteId: reporteAbierto.reporteId },
      data: { recompensa },
    });

    return { mascotaId, recompensa };
  }

  async updatePetLocation(mascotaId: string, personaId: string, lat: number, lng: number) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const now = new Date();

    await this.prisma.$executeRaw`
      UPDATE mascotas
      SET
        ultima_ubicacion_conocida = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        fecha_ultima_ubicacion    = ${now}
      WHERE mascota_id = ${mascotaId}::uuid
    `;

    this.realtime.emitPetLocationUpdated({
      mascotaId,
      lat,
      lng,
      estado: mascota.estado ?? 'en_casa',
      fechaActualizacion: now,
    });

    return { message: 'Ubicación de la mascota actualizada' };
  }

  async findPetCard(mascotaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      select: {
        mascotaId: true,
        nombre: true,
        sexo: true,
        colorPrimario: true,
        rasgosParticulares: true,
        estado: true,
        tipoMascota: { select: { nombre: true } },
        fotos: {
          select: { fotoId: true, fotoUrl: true, esPrincipal: true },
          orderBy: [{ esPrincipal: 'desc' }, { fotoId: 'asc' }],
        },
        fichaMedica: {
          select: {
            alergias: true,
            enfermedadesCronicas: true,
            medicacionDiaria: true,
            tipoSangre: true,
            notasVeterinarias: true,
          },
        },
        registrosMedicos: {
          select: {
            registroId: true,
            tipo: true,
            descripcion: true,
            fecha: true,
            veterinario: true,
          },
          orderBy: { fecha: 'desc' },
        },
        propietarios: {
          select: {
            tipoRelacion: true,
            mostrarEnQr: true,
            persona: {
              select: {
                personaId: true,
                nombre: true,
                apellidoPaterno: true,
                fotoPerfilUrl: true,
                mediosContacto: { select: { tipo: true, valor: true } },
              },
            },
          },
        },
        reportesExtravio: {
          where: { estadoReporte: 'abierto' },
          select: { recompensa: true, fechaPerdida: true },
          orderBy: { reporteId: 'desc' },
          take: 1,
        },
      },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');

    const reporteActivo = mascota.reportesExtravio[0] ?? null;

    return {
      mascotaId: mascota.mascotaId,
      nombre: mascota.nombre,
      tipo: mascota.tipoMascota?.nombre ?? null,
      sexo: mascota.sexo,
      colorPrimario: mascota.colorPrimario,
      rasgosParticulares: mascota.rasgosParticulares,
      estado: mascota.estado,
      estaExtraviada: mascota.estado === EstadoMascota.extraviada,
      reporteActivo: reporteActivo
        ? {
            recompensa: Number(reporteActivo.recompensa) || 0,
            fechaPerdida: reporteActivo.fechaPerdida,
          }
        : null,
      fotos: mascota.fotos.map((f) => ({
        fotoId: f.fotoId,
        url: f.fotoUrl,
        esPrincipal: f.esPrincipal ?? false,
      })),
      fichaMedica: mascota.fichaMedica ?? null,
      registrosMedicos: mascota.registrosMedicos,
      propietarios: mascota.propietarios
        .filter((p) => p.mostrarEnQr !== false)
        .map((p) => ({
          personaId: p.persona.personaId,
          nombreCompleto: `${p.persona.nombre} ${p.persona.apellidoPaterno}`.trim(),
          fotoPerfilUrl: p.persona.fotoPerfilUrl,
          tipoRelacion: p.tipoRelacion,
          contactos: p.persona.mediosContacto.map((c) => ({ tipo: c.tipo, valor: c.valor })),
        })),
    };
  }

  async getMedicalRecords(mascotaId: string, personaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    return this.prisma.registroMedico.findMany({
      where: { mascotaId },
      orderBy: [{ fecha: 'desc' }, { registroId: 'desc' }],
    });
  }

  async addMedicalRecord(mascotaId: string, personaId: string, dto: CreateMedicalRecordDto) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    return this.prisma.registroMedico.create({
      data: {
        mascotaId,
        tipo: dto.tipo,
        descripcion: dto.descripcion,
        fecha: dto.fecha ? new Date(dto.fecha) : null,
        veterinario: dto.veterinario ?? null,
      },
    });
  }

  async updateMedicalRecord(
    mascotaId: string,
    personaId: string,
    registroId: number,
    dto: UpdateMedicalRecordDto,
  ) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const registro = await this.prisma.registroMedico.findUnique({ where: { registroId } });
    if (!registro || registro.mascotaId !== mascotaId)
      throw new NotFoundException('Registro médico no encontrado');

    return this.prisma.registroMedico.update({
      where: { registroId },
      data: {
        ...(dto.tipo !== undefined && { tipo: dto.tipo }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.fecha !== undefined && { fecha: dto.fecha ? new Date(dto.fecha) : null }),
        ...(dto.veterinario !== undefined && { veterinario: dto.veterinario }),
      },
    });
  }

  async removeMedicalRecord(mascotaId: string, personaId: string, registroId: number) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const registro = await this.prisma.registroMedico.findUnique({ where: { registroId } });
    if (!registro || registro.mascotaId !== mascotaId)
      throw new NotFoundException('Registro médico no encontrado');

    await this.prisma.registroMedico.delete({ where: { registroId } });
    return { message: 'Registro eliminado' };
  }

  // #31 — todas las mascotas del dueño con o sin GPS + foto principal para el marcador
  async findPetsOnMap(personaId: string) {
    return this.prisma.$queryRaw<
      Array<{
        mascota_id: string;
        nombre: string;
        estado: string;
        foto_url: string | null;
        lat: number | null;
        lng: number | null;
      }>
    >`
      SELECT
        m.mascota_id,
        m.nombre,
        m.estado::text,
        (SELECT f.foto_url FROM fotos_mascota f
         WHERE f.mascota_id = m.mascota_id
         ORDER BY f.es_principal DESC, f.foto_id ASC
         LIMIT 1) AS foto_url,
        CASE WHEN m.ultima_ubicacion_conocida IS NOT NULL
             THEN ST_Y(m.ultima_ubicacion_conocida::geometry) END AS lat,
        CASE WHEN m.ultima_ubicacion_conocida IS NOT NULL
             THEN ST_X(m.ultima_ubicacion_conocida::geometry) END AS lng
      FROM mascotas m
      JOIN propietarios_mascota pm ON pm.mascota_id = m.mascota_id
      WHERE pm.persona_id = ${personaId}::uuid
      ORDER BY m.nombre
    `;
  }

  // #32 — todos los propietarios de una mascota específica con su GPS si disponible
  async findPetOwnersOnMap(mascotaId: string, personaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    return this.prisma.$queryRaw<
      Array<{
        persona_id: string;
        nombre: string;
        apellido_paterno: string;
        foto_perfil_url: string | null;
        tipo_relacion: string;
        lat: number | null;
        lng: number | null;
      }>
    >`
      SELECT
        p.persona_id::text,
        p.nombre,
        p.apellido_paterno,
        p.foto_perfil_url,
        pm.tipo_relacion::text,
        CASE WHEN u.ultima_ubicacion_conocida IS NOT NULL
             THEN ST_Y(u.ultima_ubicacion_conocida::geometry) END AS lat,
        CASE WHEN u.ultima_ubicacion_conocida IS NOT NULL
             THEN ST_X(u.ultima_ubicacion_conocida::geometry) END AS lng
      FROM propietarios_mascota pm
      JOIN personas p ON p.persona_id = pm.persona_id
      LEFT JOIN usuarios u ON u.persona_id = p.persona_id
      WHERE pm.mascota_id = ${mascotaId}::uuid
      ORDER BY pm.tipo_relacion
    `;
  }

  // ─────────────────────── Gestión de fotos ────────────────────────

  async uploadPhotos(
    mascotaId: string,
    personaId: string,
    files: Express.Multer.File[],
    nuevoPrincipalIndex?: number,
  ) {
    if (files.length < MIN_FOTOS)
      throw new BadRequestException(`Se requiere al menos ${MIN_FOTOS} foto`);

    const invalidType = files.find((f) => !ALLOWED_MIME.includes(f.mimetype));
    if (invalidType)
      throw new BadRequestException('Solo se permiten imágenes (jpeg, png, webp, gif)');

    const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) throw new BadRequestException('Cada imagen debe pesar menos de 5 MB');

    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true, fotos: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const total = mascota.fotos.length + files.length;
    if (total > MAX_FOTOS)
      throw new BadRequestException(
        `La mascota ya tiene ${mascota.fotos.length} foto(s); con ${files.length} nuevas superaría el máximo de ${MAX_FOTOS}`,
      );

    if (nuevoPrincipalIndex !== undefined && nuevoPrincipalIndex >= files.length)
      throw new BadRequestException(
        `fotoPrincipalIndex (${nuevoPrincipalIndex}) excede el número de fotos subidas (${files.length})`,
      );

    // Subir nuevas fotos a Cloudinary (no se borran las existentes)
    const uploads = await Promise.all(
      files.map((f) => this.cloudinary.uploadBuffer(f.buffer, `mascotas/${mascotaId}`)),
    );

    // Si el caller marcó una nueva como principal, despromover la actual
    const promoverNueva = nuevoPrincipalIndex !== undefined;
    if (promoverNueva) {
      await this.prisma.fotoMascota.updateMany({
        where: { mascotaId, esPrincipal: true },
        data: { esPrincipal: false },
      });
    }

    const nuevasFotos = await this.prisma.$transaction(
      uploads.map((upload, i) =>
        this.prisma.fotoMascota.create({
          data: {
            mascotaId,
            fotoUrl: upload.secure_url,
            esPrincipal: promoverNueva && i === nuevoPrincipalIndex,
          },
        }),
      ),
    );

    const principal = await this.prisma.fotoMascota.findFirst({
      where: { mascotaId, esPrincipal: true },
      orderBy: { fotoId: 'asc' },
    });
    this.realtime.emitPetProfileUpdated({
      mascotaId,
      fotoPrincipalUrl: principal?.fotoUrl ?? null,
      fechaActualizacion: new Date(),
    });

    return nuevasFotos;
  }

  async deletePhoto(mascotaId: string, personaId: string, fotoId: number) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true, fotos: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const foto = mascota.fotos.find((f) => f.fotoId === fotoId);
    if (!foto) throw new NotFoundException('Foto no encontrada');

    if (mascota.fotos.length <= MIN_FOTOS)
      throw new BadRequestException('La mascota debe tener al menos 1 foto');

    await this.cloudinary.deleteByUrl(foto.fotoUrl);
    await this.prisma.fotoMascota.delete({ where: { fotoId } });

    const principal = await this.prisma.fotoMascota.findFirst({
      where: { mascotaId, esPrincipal: true },
      orderBy: { fotoId: 'asc' },
    });
    this.realtime.emitPetProfileUpdated({
      mascotaId,
      fotoPrincipalUrl: principal?.fotoUrl ?? null,
      fechaActualizacion: new Date(),
    });

    return { message: 'Foto eliminada' };
  }

  async getScans(mascotaId: string, personaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    return this.prisma.escaneoQr.findMany({
      where: { mascotaId },
      orderBy: { escaneadoEl: 'desc' },
    });
  }

  async getReports(mascotaId: string, personaId: string) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    return this.prisma.$queryRaw<
      Array<{
        reporte_id: number;
        fecha_perdida: Date;
        recompensa: number | null;
        estado_reporte: string | null;
        lat: number | null;
        lng: number | null;
      }>
    >`
      SELECT
        r.reporte_id,
        r.fecha_perdida,
        r.recompensa,
        r.estado_reporte,
        CASE WHEN r.ultima_ubicacion_conocida IS NOT NULL
             THEN ST_Y(r.ultima_ubicacion_conocida::geometry) END AS lat,
        CASE WHEN r.ultima_ubicacion_conocida IS NOT NULL
             THEN ST_X(r.ultima_ubicacion_conocida::geometry) END AS lng
      FROM reportes_extravio r
      WHERE r.mascota_id = ${mascotaId}::uuid
      ORDER BY r.fecha_perdida DESC
    `;
  }

  async getPetByToken(tokenAcceso: string) {
    const placa = await this.prisma.placaQr.findUnique({
      where: { tokenAcceso },
    });
    if (!placa || !placa.mascotaId) throw new NotFoundException('Placa QR no encontrada');
    if (!placa.estaActiva) throw new NotFoundException('Esta placa QR está desactivada');

    return this.findPetCard(placa.mascotaId);
  }

  async registerScan(tokenAcceso: string, dto: ScanDto) {
    const placa = await this.prisma.placaQr.findUnique({
      where: { tokenAcceso },
    });
    if (!placa || !placa.mascotaId) throw new NotFoundException('Placa QR no encontrada');
    if (!placa.estaActiva) throw new NotFoundException('Esta placa QR está desactivada');

    const escaneo = await this.prisma.escaneoQr.create({
      data: {
        mascotaId: placa.mascotaId,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
      },
    });

    return {
      escaneoId: escaneo.escaneoId,
      mascotaId: escaneo.mascotaId,
      lat: escaneo.lat,
      lng: escaneo.lng,
      escaneadoEl: escaneo.escaneadoEl,
    };
  }

  private checkOwnership(
    mascota: { propietarios: Array<{ personaId: string }> },
    personaId: string,
  ) {
    const esPropietario = mascota.propietarios.some((p) => p.personaId === personaId);
    if (!esPropietario) throw new ForbiddenException('No tienes acceso a esta mascota');
  }
}
