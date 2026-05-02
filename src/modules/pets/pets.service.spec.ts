import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RelacionPropietario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from './pets.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,abc123'),
}));

const PERSONA_ID = 'persona-uuid';
const MASCOTA_ID = 'mascota-uuid';
const PLACA_ID = 'placa-uuid';
const TOKEN_ACCESO = 'token-uuid';

const mockPlaca = {
  placaId: PLACA_ID,
  mascotaId: MASCOTA_ID,
  tokenAcceso: TOKEN_ACCESO,
  estaActiva: true,
};

const mockMascota = {
  mascotaId: MASCOTA_ID,
  nombre: 'Firulais',
  razaId: null,
  sexo: 'M',
  colorPrimario: 'Café',
  rasgosParticulares: null,
  estado: 'en_casa',
  propietarios: [{ personaId: PERSONA_ID, tipoRelacion: RelacionPropietario.Dueno_Principal }],
  placaQr: mockPlaca,
  fotos: [],
  fichaMedica: null,
  raza: null,
};

const mockPrisma = {
  mascota: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  propietarioMascota: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  placaQr: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockConfig = {
  get: jest
    .fn()
    .mockImplementation((key: string, def?: string) =>
      key === 'FRONTEND_URL' ? 'http://localhost:4200' : def,
    ),
};

describe('PetsService', () => {
  let service: PetsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PetsService>(PetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── create ────────────────────────────

  describe('create', () => {
    it('crea mascota y placa QR en una transacción', async () => {
      const txMascota = { ...mockMascota, propietarios: [], placaQr: null };
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
          cb({
            ...mockPrisma,
            mascota: { ...mockPrisma.mascota, create: jest.fn().mockResolvedValue(txMascota) },
            placaQr: { create: jest.fn().mockResolvedValue(mockPlaca) },
          }),
      );

      const result = await service.create(PERSONA_ID, { nombre: 'Firulais' });

      expect(result).toHaveProperty('placaQr');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────────────────── findMyPets ────────────────────────

  describe('findMyPets', () => {
    it('retorna la lista de mascotas del propietario', async () => {
      mockPrisma.mascota.findMany.mockResolvedValue([mockMascota]);

      const result = await service.findMyPets(PERSONA_ID);

      expect(result).toHaveLength(1);
      expect(mockPrisma.mascota.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { propietarios: { some: { personaId: PERSONA_ID } } },
        }),
      );
    });
  });

  // ───────────────────────── findOne ───────────────────────────

  describe('findOne', () => {
    it('retorna la mascota con ubicación cuando el usuario es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.$queryRaw.mockResolvedValue([{ lat: -17.78, lng: -63.18 }]);

      const result = await service.findOne(MASCOTA_ID, PERSONA_ID);

      expect(result.mascotaId).toBe(MASCOTA_ID);
      expect(result.ubicacion).toEqual({ lat: -17.78, lng: -63.18 });
    });

    it('retorna ubicacion null si la mascota no tiene GPS', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.$queryRaw.mockResolvedValue([{ lat: null, lng: null }]);

      const result = await service.findOne(MASCOTA_ID, PERSONA_ID);

      expect(result.ubicacion).toBeNull();
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe', PERSONA_ID)).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascota,
        propietarios: [{ personaId: 'otro-uuid' }],
      });

      await expect(service.findOne(MASCOTA_ID, PERSONA_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────── update ────────────────────────────

  describe('update', () => {
    it('actualiza los datos de la mascota', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.mascota.update.mockResolvedValue({ ...mockMascota, nombre: 'Toby' });

      const result = await service.update(MASCOTA_ID, PERSONA_ID, { nombre: 'Toby' });

      expect(result.nombre).toBe('Toby');
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.update('no-existe', PERSONA_ID, {})).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascota,
        propietarios: [{ personaId: 'otro' }],
      });

      await expect(service.update(MASCOTA_ID, PERSONA_ID, {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────── remove ────────────────────────────

  describe('remove', () => {
    it('elimina la mascota y retorna mensaje', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.mascota.delete.mockResolvedValue(mockMascota);

      const result = await service.remove(MASCOTA_ID, PERSONA_ID);

      expect(result).toEqual({ message: 'Mascota eliminada' });
      expect(mockPrisma.mascota.delete).toHaveBeenCalledWith({ where: { mascotaId: MASCOTA_ID } });
    });
  });

  // ───────────────────────── getQr ─────────────────────────────

  describe('getQr', () => {
    it('genera imagen QR en base64 con FRONTEND_URL del config', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);

      const result = await service.getQr(MASCOTA_ID, PERSONA_ID);

      expect(result).toBe('data:image/png;base64,abc123');
      const QRCode = jest.requireMock('qrcode');
      expect(QRCode.toDataURL).toHaveBeenCalledWith(`http://localhost:4200/scan/${TOKEN_ACCESO}`);
    });

    it('lanza NotFoundException si la mascota no tiene placa QR', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({ ...mockMascota, placaQr: null });

      await expect(service.getQr(MASCOTA_ID, PERSONA_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── addOwner ──────────────────────────

  describe('addOwner', () => {
    it('agrega un co-propietario a la mascota', async () => {
      const nuevoPropietario = { personaId: 'otro-uuid', mascotaId: MASCOTA_ID };
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.propietarioMascota.create.mockResolvedValue(nuevoPropietario);

      const result = await service.addOwner(MASCOTA_ID, PERSONA_ID, {
        personaId: 'otro-uuid',
      });

      expect(result.personaId).toBe('otro-uuid');
    });
  });

  // ───────────────────────── removeOwner ───────────────────────

  describe('removeOwner', () => {
    it('elimina el co-propietario indicado', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.propietarioMascota.delete.mockResolvedValue({});

      await service.removeOwner(MASCOTA_ID, PERSONA_ID, 'otro-uuid');

      expect(mockPrisma.propietarioMascota.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personaId_mascotaId: { personaId: 'otro-uuid', mascotaId: MASCOTA_ID } },
        }),
      );
    });
  });

  // ───────────────────────── findPetsOnMap ─────────────────────

  describe('findPetsOnMap', () => {
    it('retorna mascotas con coordenadas del propietario', async () => {
      const mockRows = [
        { mascota_id: MASCOTA_ID, nombre: 'Firulais', estado: 'en_casa', lat: -17.78, lng: -63.18 },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(mockRows);

      const result = await service.findPetsOnMap(PERSONA_ID);

      expect(result).toEqual(mockRows);
    });
  });
});
