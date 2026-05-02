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
  persona: mockPersona,
};

const mockPrisma = {
  usuario: {
    findUnique: jest.fn(),
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
});
