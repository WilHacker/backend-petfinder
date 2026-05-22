import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_pw'),
  compare: jest.fn(),
}));

const mockPersona = {
  personaId: 'persona-uuid',
  nombre: 'Juan',
  apellidoPaterno: 'Pérez',
  apellidoMaterno: null,
  ci: null,
};

const mockUsuario = {
  usuarioId: 'usuario-uuid',
  personaId: 'persona-uuid',
  correoElectronico: 'juan@test.com',
  claveHash: 'hashed_pw',
  rol: 'usuario',
  persona: mockPersona,
};

const mockPrisma = {
  usuario: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  persona: {
    create: jest.fn(),
  },
  medioContacto: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('jwt_token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── register ──────────────────────────

  describe('register', () => {
    const registerDto = {
      nombre: 'Juan',
      apellidoPaterno: 'Pérez',
      correoElectronico: 'juan@test.com',
      clave: 'secreto123',
    };

    it('devuelve accessToken y datos del usuario al registrarse exitosamente', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
          cb({
            ...mockPrisma,
            persona: { create: jest.fn().mockResolvedValue(mockPersona) },
            usuario: { ...mockPrisma.usuario, create: jest.fn().mockResolvedValue(mockUsuario) },
            medioContacto: { create: jest.fn() },
          }),
      );

      const result = await service.register(registerDto);

      expect(result.accessToken).toBe('jwt_token');
      expect(result.usuario.correoElectronico).toBe('juan@test.com');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUsuario.usuarioId,
        personaId: mockPersona.personaId,
        rol: mockUsuario.rol,
      });
    });

    it('crea MedioContacto si se provee en el DTO', async () => {
      const createContacto = jest.fn();
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
          cb({
            ...mockPrisma,
            persona: { create: jest.fn().mockResolvedValue(mockPersona) },
            usuario: { ...mockPrisma.usuario, create: jest.fn().mockResolvedValue(mockUsuario) },
            medioContacto: { create: createContacto },
          }),
      );

      await service.register({
        ...registerDto,
        medioContacto: { tipo: 'WhatsApp', valor: '+591 70000000' },
      });

      expect(createContacto).toHaveBeenCalled();
    });

    it('lanza ConflictException si el correo ya está registrado', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  // ───────────────────────── login ─────────────────────────────

  describe('login', () => {
    const loginDto = { correoElectronico: 'juan@test.com', clave: 'secreto123' };

    it('devuelve accessToken al iniciar sesión correctamente', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.usuario.update.mockResolvedValue(mockUsuario);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('jwt_token');
      expect(result.usuario.correoElectronico).toBe('juan@test.com');
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('actualiza ultimoAcceso al hacer login exitoso', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.usuario.update.mockResolvedValue(mockUsuario);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login(loginDto);

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { usuarioId: mockUsuario.usuarioId },
          data: expect.objectContaining({ ultimoAcceso: expect.any(Date) }),
        }),
      );
    });
  });

  // ───────────────────────── refresh ──────────────────────────

  describe('refresh', () => {
    it('devuelve nuevos tokens cuando el refresh token es válido', async () => {
      mockPrisma.usuario.findMany.mockResolvedValue([
        { usuarioId: 'usuario-uuid', personaId: 'persona-uuid', refreshTokenHash: 'hashed_rt' },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.usuario.findUnique.mockResolvedValue({ rol: 'usuario' });
      mockPrisma.usuario.update.mockResolvedValue({});

      const result = await service.refresh('refresh-token-uuid');

      expect(result.accessToken).toBe('jwt_token');
      expect(result.refreshToken).toBeDefined();
      expect(mockJwtService.sign).toHaveBeenCalledTimes(1);
    });

    it('lanza UnauthorizedException si ningún hash coincide', async () => {
      mockPrisma.usuario.findMany.mockResolvedValue([
        { usuarioId: 'usuario-uuid', personaId: 'persona-uuid', refreshTokenHash: 'hashed_rt' },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refresh('token-invalido')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si no hay usuarios con refreshTokenHash', async () => {
      mockPrisma.usuario.findMany.mockResolvedValue([]);

      await expect(service.refresh('cualquier-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ───────────────────────── logout ────────────────────────────

  describe('logout', () => {
    it('limpia el refreshTokenHash del usuario', async () => {
      mockPrisma.usuario.update.mockResolvedValue({});

      const result = await service.logout('usuario-uuid');

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({
        where: { usuarioId: 'usuario-uuid' },
        data: { refreshTokenHash: null },
      });
      expect(result).toEqual({ message: 'Sesión cerrada correctamente' });
    });
  });

  // ─────────────────── findOrCreateGoogleUser ──────────────────

  describe('findOrCreateGoogleUser', () => {
    const googleUser = {
      email: 'juan@gmail.com',
      nombre: 'Juan',
      apellidoPaterno: 'Pérez',
      fotoPerfilUrl: 'https://lh3.googleusercontent.com/foto.jpg',
    };

    it('retorna tokens y datos del usuario si el email ya existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.usuario.update.mockResolvedValue(mockUsuario);

      const result = await service.findOrCreateGoogleUser(googleUser);

      expect(result.accessToken).toBe('jwt_token');
      expect(result.usuario.correoElectronico).toBe(mockUsuario.correoElectronico);
      expect(result.usuario.nombre).toBe(mockPersona.nombre);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('crea usuario nuevo y retorna tokens y datos si el email no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
          cb({
            ...mockPrisma,
            persona: { create: jest.fn().mockResolvedValue(mockPersona) },
            usuario: { ...mockPrisma.usuario, create: jest.fn().mockResolvedValue(mockUsuario) },
          }),
      );
      mockPrisma.usuario.update.mockResolvedValue(mockUsuario);

      const result = await service.findOrCreateGoogleUser(googleUser);

      expect(result.accessToken).toBe('jwt_token');
      expect(result.usuario.nombre).toBe(mockPersona.nombre);
      expect(result.usuario.apellidoPaterno).toBe(mockPersona.apellidoPaterno);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
