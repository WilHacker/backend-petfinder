import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddContactDto } from './dto/add-contact.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

type ZoneCheckRow = {
  zona_id: number;
  esta_dentro: boolean;
  visita_id: bigint | null;
  fecha_hora_entrada: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async findMe(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
      select: {
        usuarioId: true,
        correoElectronico: true,
        tokenFcm: true,
        configPrivacidad: true,
        estadoCuenta: true,
        ultimoAcceso: true,
        fechaUltimaUbicacion: true,
        persona: {
          select: {
            personaId: true,
            nombre: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            ci: true,
            fotoPerfilUrl: true,
            fechaNacimiento: true,
            mediosContacto: true,
          },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const geo = await this.prisma.$queryRaw<Array<{ lat: number | null; lng: number | null }>>`
      SELECT
        ST_Y(ultima_ubicacion_conocida::geometry) AS lat,
        ST_X(ultima_ubicacion_conocida::geometry) AS lng
      FROM usuarios
      WHERE usuario_id = ${usuarioId}::uuid
    `;

    return {
      ...usuario,
      ubicacion: geo[0]?.lat != null ? { lat: geo[0].lat, lng: geo[0].lng } : null,
    };
  }

  async updateProfile(usuarioId: string, dto: UpdateProfileDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const persona = await this.prisma.persona.update({
      where: { personaId: usuario.personaId },
      data: {
        ...(dto.nombre && { nombre: dto.nombre }),
        ...(dto.apellidoPaterno && { apellidoPaterno: dto.apellidoPaterno }),
        ...(dto.apellidoMaterno !== undefined && {
          apellidoMaterno: dto.apellidoMaterno,
        }),
        ...(dto.ci !== undefined && { ci: dto.ci }),
        ...(dto.fechaNacimiento && {
          fechaNacimiento: new Date(dto.fechaNacimiento),
        }),
        ...(dto.fotoPerfilUrl !== undefined && {
          fotoPerfilUrl: dto.fotoPerfilUrl,
        }),
      },
    });
    return persona;
  }

  async updateProfilePhoto(usuarioId: string, file: Express.Multer.File) {
    if (!file.mimetype.startsWith('image/'))
      throw new BadRequestException('Solo se permiten imágenes');

    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
      select: { personaId: true, persona: { select: { fotoPerfilUrl: true } } },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    if (usuario.persona.fotoPerfilUrl) {
      await this.cloudinary.deleteByUrl(usuario.persona.fotoPerfilUrl).catch(() => null);
    }

    const upload = await this.cloudinary.uploadBuffer(file.buffer, `personas/${usuario.personaId}`);

    return this.prisma.persona.update({
      where: { personaId: usuario.personaId },
      data: { fotoPerfilUrl: upload.secure_url },
      select: { personaId: true, fotoPerfilUrl: true },
    });
  }

  async addContact(usuarioId: string, dto: AddContactDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.medioContacto.create({
      data: {
        personaId: usuario.personaId,
        tipo: dto.tipo,
        valor: dto.valor,
        esPrincipal: dto.esPrincipal ?? false,
      },
    });
  }

  async removeContact(usuarioId: string, contactoId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const contacto = await this.prisma.medioContacto.findUnique({
      where: { contactoId },
    });
    if (!contacto) throw new NotFoundException('Contacto no encontrado');
    if (contacto.personaId !== usuario.personaId)
      throw new ForbiddenException('No tienes permiso sobre este contacto');

    return this.prisma.medioContacto.delete({ where: { contactoId } });
  }

  async updateLocation(usuarioId: string, dto: UpdateLocationDto) {
    const now = new Date();

    // 1. Actualiza ubicación del usuario e historial
    await this.prisma.$executeRaw`
      UPDATE usuarios
      SET
        ultima_ubicacion_conocida = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326),
        fecha_ultima_ubicacion    = NOW()
      WHERE usuario_id = ${usuarioId}::uuid
    `;

    await this.prisma.$executeRaw`
      INSERT INTO historial_ubicaciones (usuario_id, posicion)
      VALUES (
        ${usuarioId}::uuid,
        ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)
      )
    `;

    // 2. Propaga la ubicación a mascotas en_paseo y obtiene sus IDs para WS
    const mascotasActualizadas = await this.prisma.$queryRaw<
      Array<{ mascota_id: string; nombre: string; estado: string }>
    >`
      UPDATE mascotas m
      SET
        ultima_ubicacion_conocida = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326),
        fecha_ultima_ubicacion    = NOW()
      FROM propietarios_mascota pm
      JOIN usuarios u ON u.persona_id = pm.persona_id
      WHERE pm.mascota_id = m.mascota_id
        AND u.usuario_id  = ${usuarioId}::uuid
        AND m.estado       = 'en_paseo'::estado_mascota
      RETURNING m.mascota_id, m.nombre, m.estado::text
    `;

    // 3. Obtiene personaId del usuario para emitir owner:location-updated
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
      select: { personaId: true },
    });
    if (!usuario) return { message: 'Ubicación actualizada' };

    // 4. Todas las mascotas del usuario (para los rooms de co-propietarios)
    const todasLasRelaciones = await this.prisma.propietarioMascota.findMany({
      where: { personaId: usuario.personaId },
      select: { mascotaId: true },
    });
    const petRooms = todasLasRelaciones.map((r) => `pet:${r.mascotaId}`);

    // 5. Emite ubicación del dueño a co-propietarios (#32 en tiempo real)
    this.realtime.emitOwnerLocationUpdated(petRooms, {
      personaId: usuario!.personaId,
      usuarioId,
      lat: dto.lat,
      lng: dto.lng,
      fechaActualizacion: now,
    });

    // 6. Emite ubicación de cada mascota actualizada + detecta entrada/salida de zona (en paralelo)
    await Promise.all(
      mascotasActualizadas.map((m) => {
        this.realtime.emitPetLocationUpdated({
          mascotaId: m.mascota_id,
          lat: dto.lat,
          lng: dto.lng,
          estado: m.estado,
          fechaActualizacion: now,
        });
        return this.checkAndUpdateZones(m.mascota_id, dto.lat, dto.lng, now);
      }),
    );

    return { message: 'Ubicación actualizada' };
  }

  private async checkAndUpdateZones(
    mascotaId: string,
    lat: number,
    lng: number,
    now: Date,
  ): Promise<void> {
    // Obtiene todas las zonas activas de la mascota y si el punto actual está dentro
    const zonas = await this.prisma.$queryRaw<ZoneCheckRow[]>`
      SELECT
        z.zona_id,
        CASE
          WHEN z.radio_metros IS NOT NULL
          THEN ST_DWithin(
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            z.punto_central::geography,
            z.radio_metros
          )
          ELSE ST_Within(
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
            z.geometria
          )
        END AS esta_dentro,
        rv.visita_id,
        rv.fecha_hora_entrada
      FROM zonas_seguras z
      JOIN zona_mascotas zm ON zm.zona_id = z.zona_id
      LEFT JOIN registro_visitas_zonas rv
        ON rv.zona_id    = z.zona_id
       AND rv.mascota_id = zm.mascota_id
       AND rv.fecha_hora_salida IS NULL
      WHERE zm.mascota_id = ${mascotaId}::uuid
        AND z.esta_activa = true
        AND (z.radio_metros IS NOT NULL OR z.geometria IS NOT NULL)
    `;

    for (const zona of zonas) {
      if (zona.esta_dentro && zona.visita_id === null) {
        // Entró a la zona — abre registro de visita
        await this.prisma.$executeRaw`
          INSERT INTO registro_visitas_zonas (mascota_id, zona_id, fecha_hora_entrada)
          VALUES (${mascotaId}::uuid, ${zona.zona_id}, ${now})
        `;
        this.realtime.emitPetEnteredZone({
          mascotaId,
          zonaId: zona.zona_id,
          fechaHora: now,
        });
      } else if (!zona.esta_dentro && zona.visita_id !== null) {
        // Salió de la zona — cierra registro y calcula duración
        const duracionMinutos = Math.round(
          (now.getTime() - zona.fecha_hora_entrada!.getTime()) / 60_000,
        );
        await this.prisma.$executeRaw`
          UPDATE registro_visitas_zonas
          SET fecha_hora_salida = ${now},
              duracion_minutos  = ${duracionMinutos}
          WHERE visita_id = ${zona.visita_id}
        `;
        this.realtime.emitPetExitedZone({
          mascotaId,
          zonaId: zona.zona_id,
          fechaHora: now,
          duracionMinutos,
        });
      }
    }
  }

  async findUserCard(personaId: string) {
    const persona = await this.prisma.persona.findUnique({
      where: { personaId },
      select: {
        personaId: true,
        nombre: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        fotoPerfilUrl: true,
        mediosContacto: { select: { tipo: true, valor: true } },
        mascotasPropietario: {
          select: {
            mascota: {
              select: {
                mascotaId: true,
                nombre: true,
                tipoMascota: { select: { nombre: true } },
                fotos: {
                  where: { esPrincipal: true },
                  take: 1,
                  select: { fotoUrl: true },
                },
              },
            },
          },
        },
      },
    });
    if (!persona) throw new NotFoundException('Usuario no encontrado');

    return {
      personaId: persona.personaId,
      nombreCompleto: `${persona.nombre} ${persona.apellidoPaterno}`.trim(),
      fotoPerfilUrl: persona.fotoPerfilUrl,
      contactos: persona.mediosContacto.map((c) => ({ tipo: c.tipo, valor: c.valor })),
      mascotas: persona.mascotasPropietario.map((pm) => ({
        mascotaId: pm.mascota.mascotaId,
        nombre: pm.mascota.nombre,
        tipo: pm.mascota.tipoMascota?.nombre ?? null,
        fotoPrincipalUrl: pm.mascota.fotos[0]?.fotoUrl ?? null,
      })),
    };
  }

  async findUsersOnMap(opts: { lat?: number; lng?: number; radio?: number } = {}) {
    type Row = {
      usuario_id: string;
      nombre: string;
      apellido_paterno: string;
      lat: number;
      lng: number;
    };

    if (opts.lat !== undefined && opts.lng !== undefined) {
      const radio = opts.radio ?? 5000;
      return this.prisma.$queryRaw<Row[]>`
        SELECT
          u.usuario_id,
          p.nombre,
          p.apellido_paterno,
          ST_Y(u.ultima_ubicacion_conocida::geometry) AS lat,
          ST_X(u.ultima_ubicacion_conocida::geometry) AS lng
        FROM usuarios u
        JOIN personas p ON p.persona_id = u.persona_id
        WHERE u.ultima_ubicacion_conocida IS NOT NULL
          AND u.estado_cuenta = 'activa'
          AND ST_DWithin(
            u.ultima_ubicacion_conocida::geography,
            ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography,
            ${radio}
          )
        LIMIT 200
      `;
    }

    return this.prisma.$queryRaw<Row[]>`
      SELECT
        u.usuario_id,
        p.nombre,
        p.apellido_paterno,
        ST_Y(u.ultima_ubicacion_conocida::geometry) AS lat,
        ST_X(u.ultima_ubicacion_conocida::geometry) AS lng
      FROM usuarios u
      JOIN personas p ON p.persona_id = u.persona_id
      WHERE u.ultima_ubicacion_conocida IS NOT NULL
        AND u.estado_cuenta = 'activa'
      LIMIT 200
    `;
  }
}
