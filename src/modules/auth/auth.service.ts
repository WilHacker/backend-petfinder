import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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

    const token = this.jwtService.sign({
      sub: usuario.usuarioId,
      personaId: persona.personaId,
    });

    return {
      accessToken: token,
      usuario: {
        usuarioId: usuario.usuarioId,
        correoElectronico: usuario.correoElectronico,
        nombre: persona.nombre,
        apellidoPaterno: persona.apellidoPaterno,
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

    await this.prisma.usuario.update({
      where: { usuarioId: usuario.usuarioId },
      data: { ultimoAcceso: new Date() },
    });

    const token = this.jwtService.sign({
      sub: usuario.usuarioId,
      personaId: usuario.personaId,
    });

    return {
      accessToken: token,
      usuario: {
        usuarioId: usuario.usuarioId,
        correoElectronico: usuario.correoElectronico,
        nombre: usuario.persona.nombre,
        apellidoPaterno: usuario.persona.apellidoPaterno,
      },
    };
  }
}
