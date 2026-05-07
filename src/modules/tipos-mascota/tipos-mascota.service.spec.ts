import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TiposMascotaService } from './tipos-mascota.service';

const mockTipos = [
  { tipoId: 1, nombre: 'Perro' },
  { tipoId: 2, nombre: 'Gato' },
  { tipoId: 3, nombre: 'Ave' },
];

const mockPrisma = {
  tipoMascota: { findMany: jest.fn() },
};

describe('TiposMascotaService', () => {
  let service: TiposMascotaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TiposMascotaService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<TiposMascotaService>(TiposMascotaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll retorna todos los tipos ordenados por tipoId', async () => {
    mockPrisma.tipoMascota.findMany.mockResolvedValue(mockTipos);

    const result = await service.findAll();

    expect(result).toEqual(mockTipos);
    expect(mockPrisma.tipoMascota.findMany).toHaveBeenCalledWith({
      orderBy: { tipoId: 'asc' },
    });
  });
});
