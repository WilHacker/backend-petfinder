import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddContactDto } from './dto/add-contact.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.prisma.$executeRaw`
      UPDATE usuarios
      SET
        ultima_ubicacion_conocida = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326),
        fecha_ultima_ubicacion = NOW()
      WHERE usuario_id = ${usuarioId}::uuid
    `;

    await this.prisma.$executeRaw`
      INSERT INTO historial_ubicaciones (usuario_id, posicion)
      VALUES (
        ${usuarioId}::uuid,
        ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)
      )
    `;

    return { message: 'Ubicación actualizada' };
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
