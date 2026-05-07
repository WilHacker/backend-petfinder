import { Test, TestingModule } from '@nestjs/testing';
import { TiposMascotaController } from './tipos-mascota.controller';
import { TiposMascotaService } from './tipos-mascota.service';

const mockTipos = [
  { tipoId: 1, nombre: 'Perro' },
  { tipoId: 2, nombre: 'Gato' },
  { tipoId: 3, nombre: 'Ave' },
];

const mockService = { findAll: jest.fn() };

describe('TiposMascotaController', () => {
  let controller: TiposMascotaController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TiposMascotaController],
      providers: [{ provide: TiposMascotaService, useValue: mockService }],
    }).compile();

    controller = module.get<TiposMascotaController>(TiposMascotaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delega a tiposMascotaService.findAll', async () => {
    mockService.findAll.mockResolvedValue(mockTipos);

    const result = await controller.findAll();

    expect(mockService.findAll).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockTipos);
  });
});
