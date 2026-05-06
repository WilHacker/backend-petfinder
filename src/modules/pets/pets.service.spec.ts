import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RelacionPropietario } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from './pets.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,abc123'),
}));

const PERSONA_ID = 'persona-uuid';
const MASCOTA_ID = 'mascota-uuid';
const PLACA_ID = 'placa-uuid';
const TOKEN_ACCESO = 'token-uuid';
const FOTO_ID = 1;
const FOTO_URL = 'https://res.cloudinary.com/petImg/image/upload/v123/mascotas/foto.jpg';

const mockPlaca = {
  placaId: PLACA_ID,
  mascotaId: MASCOTA_ID,
  tokenAcceso: TOKEN_ACCESO,
  estaActiva: true,
};

const mockFoto = { fotoId: FOTO_ID, mascotaId: MASCOTA_ID, fotoUrl: FOTO_URL, esPrincipal: true };

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
  fotoMascota: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    delete: jest.fn(),
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

const mockCloudinary = {
  uploadBuffer: jest.fn(),
  deleteByUrl: jest.fn().mockResolvedValue(undefined),
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
        { provide: CloudinaryService, useValue: mockCloudinary },
      ],
    }).compile();

    service = module.get<PetsService>(PetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── create ────────────────────────────

  describe('create', () => {
    const txMascota = { ...mockMascota, propietarios: [], placaQr: null };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (opsOrCb: unknown) => {
        if (typeof opsOrCb === 'function') {
          return (opsOrCb as (tx: typeof mockPrisma) => Promise<unknown>)({
            ...mockPrisma,
            mascota: { ...mockPrisma.mascota, create: jest.fn().mockResolvedValue(txMascota) },
            placaQr: { create: jest.fn().mockResolvedValue(mockPlaca) },
          });
        }
        return Promise.all(opsOrCb as Promise<unknown>[]);
      });
    });

    it('crea mascota y placa QR sin fotos', async () => {
      const result = await service.create(PERSONA_ID, { nombre: 'Firulais' });

      expect(result).toHaveProperty('placaQr');
      expect(result.fotos).toHaveLength(0);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('crea mascota y sube fotos a Cloudinary cuando se envían archivos', async () => {
      const fakeFile: Express.Multer.File = {
        buffer: Buffer.from('img'),
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        size: 500,
        fieldname: 'fotos',
        encoding: '7bit',
        stream: null as never,
        destination: '',
        filename: '',
        path: '',
      };
      mockCloudinary.uploadBuffer.mockResolvedValue({ secure_url: FOTO_URL });
      mockPrisma.fotoMascota.create.mockResolvedValue(mockFoto);

      const result = await service.create(PERSONA_ID, { nombre: 'Firulais' }, [fakeFile], 0);

      expect(mockCloudinary.uploadBuffer).toHaveBeenCalledTimes(1);
      expect(mockPrisma.fotoMascota.create).toHaveBeenCalledTimes(1);
      expect(result.fotos).toHaveLength(1);
    });

    it('lanza BadRequestException si se envían más de 4 fotos', async () => {
      const files = Array(5).fill({
        buffer: Buffer.from('x'),
        mimetype: 'image/jpeg',
        size: 100,
      }) as Express.Multer.File[];

      await expect(service.create(PERSONA_ID, { nombre: 'x' }, files)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el MIME no es imagen', async () => {
      const files = [
        { buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 100 },
      ] as Express.Multer.File[];

      await expect(service.create(PERSONA_ID, { nombre: 'x' }, files)).rejects.toThrow(
        BadRequestException,
      );
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

  // ───────────────────────── uploadPhotos ──────────────────────

  describe('uploadPhotos', () => {
    const makeFile = (mimetype = 'image/jpeg', size = 1000): Express.Multer.File =>
      ({
        buffer: Buffer.from('fake-image'),
        mimetype,
        originalname: 'foto.jpg',
        size,
        fieldname: 'fotos',
        encoding: '7bit',
        stream: null as never,
        destination: '',
        filename: '',
        path: '',
      }) satisfies Express.Multer.File;

    const mascotaConFotos = { ...mockMascota, fotos: [mockFoto] };

    beforeEach(() => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mascotaConFotos);
      mockPrisma.fotoMascota.deleteMany.mockResolvedValue({ count: 1 });
      mockCloudinary.uploadBuffer.mockResolvedValue({ secure_url: FOTO_URL });
      mockPrisma.fotoMascota.create.mockResolvedValue(mockFoto);
      mockPrisma.$transaction.mockImplementation((ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : (ops as () => unknown)(),
      );
    });

    it('reemplaza fotos existentes y sube las nuevas a Cloudinary', async () => {
      const files = [makeFile(), makeFile()];

      const result = await service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files, 0);

      expect(mockCloudinary.deleteByUrl).toHaveBeenCalledWith(FOTO_URL);
      expect(mockPrisma.fotoMascota.deleteMany).toHaveBeenCalledWith({
        where: { mascotaId: MASCOTA_ID },
      });
      expect(mockCloudinary.uploadBuffer).toHaveBeenCalledTimes(2);
      expect(mockPrisma.fotoMascota.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('marca correctamente la foto principal según el índice', async () => {
      const files = [makeFile(), makeFile()];
      const createdFotos = [
        { ...mockFoto, fotoId: 1, esPrincipal: false },
        { ...mockFoto, fotoId: 2, esPrincipal: true },
      ];
      mockPrisma.fotoMascota.create
        .mockResolvedValueOnce(createdFotos[0])
        .mockResolvedValueOnce(createdFotos[1]);

      await service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files, 1);

      const createCalls = mockPrisma.fotoMascota.create.mock.calls;
      expect(createCalls[0][0].data.esPrincipal).toBe(false);
      expect(createCalls[1][0].data.esPrincipal).toBe(true);
    });

    it('lanza BadRequestException si no se envía ningún archivo', async () => {
      await expect(service.uploadPhotos(MASCOTA_ID, PERSONA_ID, [], 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si se envían más de 4 archivos', async () => {
      const files = [makeFile(), makeFile(), makeFile(), makeFile(), makeFile()];

      await expect(service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files, 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el MIME no es imagen', async () => {
      const files = [makeFile('application/pdf')];

      await expect(service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files, 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si un archivo supera 5 MB', async () => {
      const files = [makeFile('image/jpeg', 6 * 1024 * 1024)];

      await expect(service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files, 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.uploadPhotos('no-existe', PERSONA_ID, [makeFile()], 0)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mascotaConFotos,
        propietarios: [{ personaId: 'otro-uuid' }],
      });

      await expect(service.uploadPhotos(MASCOTA_ID, PERSONA_ID, [makeFile()], 0)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───────────────────────── deletePhoto ───────────────────────

  describe('deletePhoto', () => {
    const mascotaConDosFotos = {
      ...mockMascota,
      fotos: [
        { fotoId: 1, fotoUrl: FOTO_URL, esPrincipal: true },
        {
          fotoId: 2,
          fotoUrl: 'https://res.cloudinary.com/petImg/image/upload/v123/mascotas/foto2.jpg',
          esPrincipal: false,
        },
      ],
    };

    it('elimina la foto de Cloudinary y de la BD', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mascotaConDosFotos);
      mockPrisma.fotoMascota.delete.mockResolvedValue(mockFoto);

      const result = await service.deletePhoto(MASCOTA_ID, PERSONA_ID, FOTO_ID);

      expect(mockCloudinary.deleteByUrl).toHaveBeenCalledWith(FOTO_URL);
      expect(mockPrisma.fotoMascota.delete).toHaveBeenCalledWith({ where: { fotoId: FOTO_ID } });
      expect(result).toEqual({ message: 'Foto eliminada' });
    });

    it('lanza BadRequestException si es la única foto', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({ ...mockMascota, fotos: [mockFoto] });

      await expect(service.deletePhoto(MASCOTA_ID, PERSONA_ID, FOTO_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si la foto no pertenece a la mascota', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mascotaConDosFotos);

      await expect(service.deletePhoto(MASCOTA_ID, PERSONA_ID, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.deletePhoto('no-existe', PERSONA_ID, FOTO_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mascotaConDosFotos,
        propietarios: [{ personaId: 'otro-uuid' }],
      });

      await expect(service.deletePhoto(MASCOTA_ID, PERSONA_ID, FOTO_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
