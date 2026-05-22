import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  findOrCreateGoogleUser: jest.fn(),
};

const mockAuthResponse = {
  accessToken: 'jwt_token',
  refreshToken: 'refresh_token',
  usuario: {
    usuarioId: 'uuid',
    correoElectronico: 'juan@test.com',
    nombre: 'Juan',
    apellidoPaterno: 'Pérez',
  },
};

// Override guards that require external infrastructure
const mockJwtAuthGuard = { canActivate: (_ctx: ExecutionContext) => true };
const mockGoogleAuthGuard = { canActivate: (_ctx: ExecutionContext) => true };

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(AuthGuard('google'))
      .useValue(mockGoogleAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('delega al AuthService.register y retorna su resultado', async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);
      const dto: RegisterDto = {
        nombre: 'Juan',
        apellidoPaterno: 'Pérez',
        correoElectronico: 'juan@test.com',
        clave: 'secreto',
      };

      const result = await controller.register(dto);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('login', () => {
    it('delega al AuthService.login y retorna su resultado', async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      const dto: LoginDto = { correoElectronico: 'juan@test.com', clave: 'secreto' };

      const result = await controller.login(dto);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('refresh', () => {
    it('delega al AuthService.refresh con el refreshToken del body', async () => {
      mockAuthService.refresh.mockResolvedValue(mockAuthResponse);

      const result = await controller.refresh({ refreshToken: 'refresh_token' });

      expect(mockAuthService.refresh).toHaveBeenCalledWith('refresh_token');
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('logout', () => {
    it('delega al AuthService.logout con el usuarioId del JWT', async () => {
      mockAuthService.logout.mockResolvedValue({ message: 'Sesión cerrada' });

      const result = await controller.logout('usuario-uuid');

      expect(mockAuthService.logout).toHaveBeenCalledWith('usuario-uuid');
      expect(result).toEqual({ message: 'Sesión cerrada' });
    });
  });

  describe('googleCallback', () => {
    it('llama a findOrCreateGoogleUser con req.user y redirige al deep link petfinder://', async () => {
      const googleUser = {
        email: 'juan@gmail.com',
        nombre: 'Juan',
        apellidoPaterno: 'Pérez',
        fotoPerfilUrl: 'https://lh3.googleusercontent.com/foto.jpg',
      };
      mockAuthService.findOrCreateGoogleUser.mockResolvedValue(mockAuthResponse);
      const mockReq = { user: googleUser } as unknown as import('express').Request;
      const redirectSpy = jest.fn();
      const mockRes = { redirect: redirectSpy } as unknown as import('express').Response;

      await controller.googleCallback(mockReq, mockRes);

      expect(mockAuthService.findOrCreateGoogleUser).toHaveBeenCalledWith(googleUser);
      expect(redirectSpy).toHaveBeenCalledWith(
        expect.stringContaining('petfinder://auth/callback'),
      );
    });
  });
});
