import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
};

const mockAuthResponse = {
  accessToken: 'jwt_token',
  usuario: {
    usuarioId: 'uuid',
    correoElectronico: 'juan@test.com',
    nombre: 'Juan',
    apellidoPaterno: 'Pérez',
  },
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

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
});
