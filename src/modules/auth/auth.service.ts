import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RolUsuario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.usuario.findUnique({
      where: { correoElectronico: dto.correoElectronico },
    });
    if (exists) throw new ConflictException('El correo ya está registrado');

    const claveHash = await bcrypt.hash(dto.clave, 10);

    const { persona, usuario } = await this.prisma.$transaction(async (tx) => {
      const persona = await tx.persona.create({
        data: {
          nombre: dto.nombre,
          apellidoPaterno: dto.apellidoPaterno,
          apellidoMaterno: dto.apellidoMaterno,
          ci: dto.ci,
        },
      });

      const usuario = await tx.usuario.create({
        data: {
          personaId: persona.personaId,
          correoElectronico: dto.correoElectronico,
          claveHash,
        },
      });

      if (dto.medioContacto) {
        await tx.medioContacto.create({
          data: {
            personaId: persona.personaId,
            tipo: dto.medioContacto.tipo,
            valor: dto.medioContacto.valor,
            esPrincipal: true,
          },
        });
      }

      return { persona, usuario };
    });

    const tokens = await this.generateTokens(usuario.usuarioId, persona.personaId, usuario.rol);

    return {
      ...tokens,
      usuario: {
        usuarioId: usuario.usuarioId,
        correoElectronico: usuario.correoElectronico,
        nombre: persona.nombre,
        apellidoPaterno: persona.apellidoPaterno,
        rol: usuario.rol,
      },
    };
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correoElectronico: dto.correoElectronico },
      include: { persona: true },
    });

    if (!usuario) throw new UnauthorizedException('Credenciales inválidas');

    const valida = await bcrypt.compare(dto.clave, usuario.claveHash);
    if (!valida) throw new UnauthorizedException('Credenciales inválidas');

    const tokens = await this.generateTokens(usuario.usuarioId, usuario.personaId, usuario.rol);

    await this.prisma.usuario.update({
      where: { usuarioId: usuario.usuarioId },
      data: { ultimoAcceso: new Date() },
    });

    return {
      ...tokens,
      usuario: {
        usuarioId: usuario.usuarioId,
        correoElectronico: usuario.correoElectronico,
        nombre: usuario.persona.nombre,
        apellidoPaterno: usuario.persona.apellidoPaterno,
        rol: usuario.rol,
      },
    };
  }

  async refresh(refreshToken: string) {
    // Busca al usuario que tenga este refresh token
    const usuarios = await this.prisma.usuario.findMany({
      where: { refreshTokenHash: { not: null } },
      select: { usuarioId: true, personaId: true, refreshTokenHash: true },
    });

    let matchedUsuario: { usuarioId: string; personaId: string } | null = null;
    for (const u of usuarios) {
      if (u.refreshTokenHash && (await bcrypt.compare(refreshToken, u.refreshTokenHash))) {
        matchedUsuario = u;
        break;
      }
    }

    if (!matchedUsuario) throw new UnauthorizedException('Refresh token inválido o expirado');

    return this.generateTokens(matchedUsuario.usuarioId, matchedUsuario.personaId);
  }

  async logout(usuarioId: string) {
    await this.prisma.usuario.update({
      where: { usuarioId },
      data: { refreshTokenHash: null },
    });
    return { message: 'Sesión cerrada correctamente' };
  }

  async findOrCreateGoogleUser(googleUser: {
    email: string;
    nombre: string;
    apellidoPaterno: string;
    fotoPerfilUrl?: string;
  }) {
    const existing = await this.prisma.usuario.findUnique({
      where: { correoElectronico: googleUser.email },
      include: { persona: true },
    });

    if (existing) {
      const tokens = await this.generateTokens(existing.usuarioId, existing.personaId);
      return {
        ...tokens,
        usuario: {
          usuarioId: existing.usuarioId,
          correoElectronico: existing.correoElectronico,
          nombre: existing.persona.nombre,
          apellidoPaterno: existing.persona.apellidoPaterno,
          rol: existing.rol,
        },
      };
    }

    // Crear cuenta nueva con clave aleatoria (no la necesita para OAuth)
    const claveHash = await bcrypt.hash(randomUUID(), 10);

    const { persona, usuario } = await this.prisma.$transaction(async (tx) => {
      const persona = await tx.persona.create({
        data: {
          nombre: googleUser.nombre,
          apellidoPaterno: googleUser.apellidoPaterno,
          fotoPerfilUrl: googleUser.fotoPerfilUrl,
        },
      });

      const usuario = await tx.usuario.create({
        data: {
          personaId: persona.personaId,
          correoElectronico: googleUser.email,
          claveHash,
        },
      });

      return { persona, usuario };
    });

    const tokens = await this.generateTokens(usuario.usuarioId, usuario.personaId);
    return {
      ...tokens,
      usuario: {
        usuarioId: usuario.usuarioId,
        correoElectronico: usuario.correoElectronico,
        nombre: persona.nombre,
        apellidoPaterno: persona.apellidoPaterno,
        rol: usuario.rol,
      },
    };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private async generateTokens(usuarioId: string, personaId: string, rol?: RolUsuario) {
    let userRol = rol;
    if (!userRol) {
      const u = await this.prisma.usuario.findUnique({
        where: { usuarioId },
        select: { rol: true },
      });
      userRol = u?.rol ?? RolUsuario.usuario;
    }

    const accessToken = this.jwtService.sign({ sub: usuarioId, personaId, rol: userRol });

    const refreshToken = randomUUID();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.usuario.update({
      where: { usuarioId },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }
}
