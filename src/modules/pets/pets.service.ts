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
import { AddOwnerDto } from './dto/add-owner.dto';
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

    return this.prisma.mascota.update({
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

  async getQr(mascotaId: string, personaId: string): Promise<string> {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true, placaQr: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);
    if (!mascota.placaQr) throw new NotFoundException('La mascota no tiene placa QR');

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://petfinder.app');
    const url = `${frontendUrl}/scan/${mascota.placaQr.tokenAcceso}`;
    return QRCode.toDataURL(url);
  }

  async addOwner(mascotaId: string, personaId: string, dto: AddOwnerDto) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    const personaExiste = await this.prisma.persona.findUnique({
      where: { personaId: dto.personaId },
      select: { personaId: true },
    });
    if (!personaExiste) throw new NotFoundException('La persona indicada no existe');

    const yaEsPropietario = mascota.propietarios.some((p) => p.personaId === dto.personaId);
    if (yaEsPropietario)
      throw new BadRequestException('Esta persona ya es propietaria o cuidadora de la mascota');

    const nuevaRelacion = await this.prisma.propietarioMascota.create({
      data: {
        mascotaId,
        personaId: dto.personaId,
        tipoRelacion: dto.tipoRelacion ?? RelacionPropietario.Cuidador,
        recibeAlertas: dto.recibeAlertas ?? true,
        mostrarEnQr: dto.mostrarEnQr ?? true,
      },
      include: { persona: true },
    });

    // Busca usuarioId del nuevo propietario para forzar unión al room de la mascota
    const nuevoUsuario = await this.prisma.usuario.findUnique({
      where: { personaId: dto.personaId },
      select: { usuarioId: true },
    });

    this.realtime.emitOwnerAdded(mascotaId, nuevoUsuario?.usuarioId ?? null, {
      mascotaId,
      personaId: dto.personaId,
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
      },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');

    return {
      mascotaId: mascota.mascotaId,
      nombre: mascota.nombre,
      tipo: mascota.tipoMascota?.nombre ?? null,
      sexo: mascota.sexo,
      colorPrimario: mascota.colorPrimario,
      rasgosParticulares: mascota.rasgosParticulares,
      estado: mascota.estado,
      fotos: mascota.fotos.map((f) => ({
        fotoId: f.fotoId,
        url: f.fotoUrl,
        esPrincipal: f.esPrincipal ?? false,
      })),
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
    fotoPrincipalIndex = 0,
  ) {
    if (files.length < MIN_FOTOS)
      throw new BadRequestException(`Se requiere al menos ${MIN_FOTOS} foto`);
    if (files.length > MAX_FOTOS)
      throw new BadRequestException(`Máximo ${MAX_FOTOS} fotos permitidas`);

    const invalidType = files.find((f) => !ALLOWED_MIME.includes(f.mimetype));
    if (invalidType)
      throw new BadRequestException('Solo se permiten imágenes (jpeg, png, webp, gif)');

    const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) throw new BadRequestException('Cada imagen debe pesar menos de 5 MB');

    if (fotoPrincipalIndex >= files.length)
      throw new BadRequestException(
        `fotoPrincipalIndex (${fotoPrincipalIndex}) excede el número de fotos subidas (${files.length})`,
      );

    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true, fotos: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    // Eliminar fotos anteriores de Cloudinary y de la BD
    await Promise.all(mascota.fotos.map((f) => this.cloudinary.deleteByUrl(f.fotoUrl)));
    await this.prisma.fotoMascota.deleteMany({ where: { mascotaId } });

    // Subir nuevas fotos a Cloudinary
    const uploads = await Promise.all(
      files.map((f) => this.cloudinary.uploadBuffer(f.buffer, `mascotas/${mascotaId}`)),
    );

    // Insertar registros en BD
    return this.prisma.$transaction(
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

  async deletePhoto(mascotaId: string, personaId: string, fotoId: number) {
    const mascota = await this.prisma.mascota.findUnique({
      where: { mascotaId },
      include: { propietarios: true, fotos: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    this.checkOwnership(mascota, personaId);

    if (mascota.fotos.length <= MIN_FOTOS)
      throw new BadRequestException('La mascota debe tener al menos 1 foto');

    const foto = mascota.fotos.find((f) => f.fotoId === fotoId);
    if (!foto) throw new NotFoundException('Foto no encontrada');

    await this.cloudinary.deleteByUrl(foto.fotoUrl);
    await this.prisma.fotoMascota.delete({ where: { fotoId } });
    return { message: 'Foto eliminada' };
  }

  private checkOwnership(
    mascota: { propietarios: Array<{ personaId: string }> },
    personaId: string,
  ) {
    const esPropietario = mascota.propietarios.some((p) => p.personaId === personaId);
    if (!esPropietario) throw new ForbiddenException('No tienes acceso a esta mascota');
  }
}
