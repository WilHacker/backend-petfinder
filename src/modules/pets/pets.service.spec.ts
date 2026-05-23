import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EstadoMascota, RelacionPropietario } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { NotificationsService } from '../../infrastructure/notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from './pets.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,abc123'),
  toString: jest.fn().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg">...</svg>'),
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
  tipoId: null,
  sexo: 'M',
  colorPrimario: 'Café',
  rasgosParticulares: null,
  estado: 'en_casa',
  propietarios: [{ personaId: PERSONA_ID, tipoRelacion: RelacionPropietario.Dueno_Principal }],
  placaQr: mockPlaca,
  fotos: [],
  fichaMedica: null,
  tipoMascota: null,
};

// Mascota con un co-propietario adicional (para tests de removeOwner)
const mockMascotaConCopropietario = {
  ...mockMascota,
  propietarios: [
    { personaId: PERSONA_ID, tipoRelacion: RelacionPropietario.Dueno_Principal },
    { personaId: 'coprop-uuid', tipoRelacion: RelacionPropietario.Cuidador },
  ],
};

const mockPrisma = {
  mascota: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  persona: {
    findUnique: jest.fn(),
  },
  propietarioMascota: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  placaQr: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  fotoMascota: {
    create: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
  reporteExtravio: {
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  registroMedico: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  escaneoQr: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  usuario: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn().mockResolvedValue(1),
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

const mockRealtime = {
  emitPetRegistered: jest.fn(),
  emitPetStatusChanged: jest.fn(),
  emitOwnerAdded: jest.fn(),
  emitPetLocationUpdated: jest.fn(),
  emitPetProfileUpdated: jest.fn(),
};

const mockNotifications = {
  sendPetLostAlert: jest.fn().mockResolvedValue(undefined),
  sendZoneAlert: jest.fn().mockResolvedValue(undefined),
  sendRadiusAlert: jest.fn().mockResolvedValue(3),
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
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: NotificationsService, useValue: mockNotifications },
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
      mockPrisma.mascota.create.mockResolvedValue(txMascota);
      mockPrisma.placaQr.create.mockResolvedValue(mockPlaca);
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation((ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : (ops as () => unknown)(),
      );
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
      expect(QRCode.toDataURL).toHaveBeenCalledWith(`http://localhost:4200/scan/${TOKEN_ACCESO}`, {
        width: 300,
      });
    });

    it('genera SVG cuando format=svg', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);

      const result = await service.getQr(MASCOTA_ID, PERSONA_ID, 300, 'svg');

      expect(result).toContain('<svg');
      const QRCode = jest.requireMock('qrcode');
      expect(QRCode.toString).toHaveBeenCalledWith(`http://localhost:4200/scan/${TOKEN_ACCESO}`, {
        type: 'svg',
      });
    });

    it('lanza NotFoundException si la mascota no tiene placa QR', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({ ...mockMascota, placaQr: null });

      await expect(service.getQr(MASCOTA_ID, PERSONA_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────── sendCommunityAlert ──────────────────────

  describe('sendCommunityAlert', () => {
    beforeEach(() => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.$queryRaw.mockResolvedValue([{ tiene_gps: true }]);
      mockNotifications.sendRadiusAlert.mockResolvedValue(3);
    });

    it('retorna el conteo de usuarios notificados', async () => {
      const result = await service.sendCommunityAlert(MASCOTA_ID, PERSONA_ID, 5000);

      expect(result.usuariosNotificados).toBe(3);
      expect(result.message).toContain('3 usuario(s)');
      expect(mockNotifications.sendRadiusAlert).toHaveBeenCalledWith(MASCOTA_ID, 5000);
    });

    it('retorna mensaje y razon cuando no hay usuarios cercanos', async () => {
      mockNotifications.sendRadiusAlert.mockResolvedValue(0);

      const result = await service.sendCommunityAlert(MASCOTA_ID, PERSONA_ID, 1000);

      expect(result.usuariosNotificados).toBe(0);
      expect(result.message).toBe('No se pudo notificar a nadie');
      expect(result.razon).toContain('1 km');
    });

    it('lanza BadRequestException si la mascota no tiene GPS', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ tiene_gps: false }]);

      await expect(service.sendCommunityAlert(MASCOTA_ID, PERSONA_ID, 5000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.sendCommunityAlert(MASCOTA_ID, PERSONA_ID, 5000)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si no es propietario', async () => {
      await expect(
        service.sendCommunityAlert(MASCOTA_ID, 'otro-persona-uuid', 5000),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────── addOwner ──────────────────────────

  describe('addOwner', () => {
    const mockNuevaRelacion = {
      personaId: 'coprop-uuid',
      mascotaId: MASCOTA_ID,
      tipoRelacion: RelacionPropietario.Cuidador,
      persona: { nombre: 'Ana', apellidoPaterno: 'García' },
    };

    beforeEach(() => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.usuario.findUnique.mockResolvedValue({
        usuarioId: 'coprop-user-uuid',
        personaId: 'coprop-uuid',
      });
      mockPrisma.propietarioMascota.create.mockResolvedValue(mockNuevaRelacion);
    });

    it('agrega un co-propietario a la mascota', async () => {
      const result = await service.addOwner(MASCOTA_ID, PERSONA_ID, {
        correoElectronico: 'ana@example.com',
      });

      expect(result.personaId).toBe('coprop-uuid');
      expect(mockPrisma.propietarioMascota.create).toHaveBeenCalledTimes(1);
      expect(mockRealtime.emitOwnerAdded).toHaveBeenCalledTimes(1);
    });

    it('lanza NotFoundException si el correo no tiene cuenta asociada', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.addOwner(MASCOTA_ID, PERSONA_ID, { correoElectronico: 'noexiste@example.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si la persona ya es propietaria', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        usuarioId: 'owner-user-uuid',
        personaId: PERSONA_ID,
      });

      await expect(
        service.addOwner(MASCOTA_ID, PERSONA_ID, { correoElectronico: 'owner@example.com' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ───────────────────────── removeOwner ───────────────────────

  describe('removeOwner', () => {
    it('elimina el co-propietario (no-principal) indicado', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascotaConCopropietario);
      mockPrisma.propietarioMascota.delete.mockResolvedValue({});

      await service.removeOwner(MASCOTA_ID, PERSONA_ID, 'coprop-uuid');

      expect(mockPrisma.propietarioMascota.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personaId_mascotaId: { personaId: 'coprop-uuid', mascotaId: MASCOTA_ID } },
        }),
      );
    });

    it('lanza ForbiddenException si se intenta eliminar al Dueno_Principal', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascotaConCopropietario);

      await expect(service.removeOwner(MASCOTA_ID, PERSONA_ID, PERSONA_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza NotFoundException si el propietario indicado no está en la lista', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);

      await expect(service.removeOwner(MASCOTA_ID, PERSONA_ID, 'no-existe-uuid')).rejects.toThrow(
        NotFoundException,
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
      mockCloudinary.uploadBuffer.mockResolvedValue({ secure_url: FOTO_URL });
      mockPrisma.fotoMascota.create.mockResolvedValue(mockFoto);
      mockPrisma.fotoMascota.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.fotoMascota.findFirst.mockResolvedValue(mockFoto);
      mockPrisma.$transaction.mockImplementation((ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : (ops as () => unknown)(),
      );
    });

    it('agrega fotos sin borrar las existentes', async () => {
      const files = [makeFile(), makeFile()];

      const result = await service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files);

      expect(mockCloudinary.deleteByUrl).not.toHaveBeenCalled();
      expect(mockPrisma.fotoMascota.deleteMany).not.toHaveBeenCalled();
      expect(mockCloudinary.uploadBuffer).toHaveBeenCalledTimes(2);
      expect(mockPrisma.fotoMascota.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('si la suma excede MAX_FOTOS lanza BadRequestException', async () => {
      // mascotaConFotos ya tiene 1 foto; con 4 nuevas serían 5 > 4
      const files = [makeFile(), makeFile(), makeFile(), makeFile()];

      await expect(service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('si se pasa fotoPrincipalIndex, despromueve la principal actual y marca la nueva', async () => {
      const files = [makeFile(), makeFile()];

      await service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files, 1);

      expect(mockPrisma.fotoMascota.updateMany).toHaveBeenCalledWith({
        where: { mascotaId: MASCOTA_ID, esPrincipal: true },
        data: { esPrincipal: false },
      });
      const createCalls = mockPrisma.fotoMascota.create.mock.calls;
      expect(createCalls[0][0].data.esPrincipal).toBe(false);
      expect(createCalls[1][0].data.esPrincipal).toBe(true);
    });

    it('si NO se pasa fotoPrincipalIndex, no toca la principal actual y las nuevas quedan no-principales', async () => {
      const files = [makeFile()];

      await service.uploadPhotos(MASCOTA_ID, PERSONA_ID, files);

      expect(mockPrisma.fotoMascota.updateMany).not.toHaveBeenCalled();
      const createCalls = mockPrisma.fotoMascota.create.mock.calls;
      expect(createCalls[0][0].data.esPrincipal).toBe(false);
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

    it('emite pet:profile-updated con fotoPrincipalUrl tras subir fotos', async () => {
      await service.uploadPhotos(MASCOTA_ID, PERSONA_ID, [makeFile()]);

      expect(mockRealtime.emitPetProfileUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          mascotaId: MASCOTA_ID,
          fotoPrincipalUrl: FOTO_URL,
        }),
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
      mockPrisma.fotoMascota.findFirst.mockResolvedValue({
        fotoUrl: 'https://cdn.example.com/nueva-principal.jpg',
      });

      const result = await service.deletePhoto(MASCOTA_ID, PERSONA_ID, FOTO_ID);

      expect(mockCloudinary.deleteByUrl).toHaveBeenCalledWith(FOTO_URL);
      expect(mockPrisma.fotoMascota.delete).toHaveBeenCalledWith({ where: { fotoId: FOTO_ID } });
      expect(result).toEqual({ message: 'Foto eliminada' });
    });

    it('emite pet:profile-updated con la nueva fotoPrincipalUrl tras eliminar', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mascotaConDosFotos);
      mockPrisma.fotoMascota.delete.mockResolvedValue(mockFoto);
      mockPrisma.fotoMascota.findFirst.mockResolvedValue({
        fotoUrl: 'https://cdn.example.com/nueva-principal.jpg',
      });

      await service.deletePhoto(MASCOTA_ID, PERSONA_ID, FOTO_ID);

      expect(mockRealtime.emitPetProfileUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          mascotaId: MASCOTA_ID,
          fotoPrincipalUrl: 'https://cdn.example.com/nueva-principal.jpg',
        }),
      );
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

  // ───────────────────────── updateStatus ──────────────────────

  describe('updateStatus', () => {
    beforeEach(() => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.mascota.update.mockResolvedValue({
        mascotaId: MASCOTA_ID,
        nombre: 'Firulais',
        estado: 'extraviada',
      });
    });

    it('actualiza el estado de la mascota', async () => {
      mockPrisma.reporteExtravio.findFirst.mockResolvedValue({ reporteId: 1 }); // ya hay reporte abierto

      const result = await service.updateStatus(MASCOTA_ID, PERSONA_ID, 'extraviada');

      expect(mockPrisma.mascota.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'extraviada' } }),
      );
      expect(result.estado).toBe('extraviada');
    });

    it('crea reporte de extravío y envía las 3 alertas si no hay reporte abierto', async () => {
      mockPrisma.reporteExtravio.findFirst.mockResolvedValue(null); // sin reporte previo

      await service.updateStatus(MASCOTA_ID, PERSONA_ID, 'extraviada');

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockNotifications.sendPetLostAlert).toHaveBeenCalledWith(MASCOTA_ID);
      expect(mockNotifications.sendZoneAlert).toHaveBeenCalledWith(MASCOTA_ID);
      expect(mockNotifications.sendRadiusAlert).toHaveBeenCalledWith(MASCOTA_ID);
    });

    it('no crea reporte duplicado si ya hay uno abierto', async () => {
      mockPrisma.reporteExtravio.findFirst.mockResolvedValue({ reporteId: 5 });

      await service.updateStatus(MASCOTA_ID, PERSONA_ID, 'extraviada');

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockNotifications.sendPetLostAlert).not.toHaveBeenCalled();
    });

    it('cierra reportes abiertos cuando el estado no es extraviada', async () => {
      mockPrisma.mascota.update.mockResolvedValue({
        mascotaId: MASCOTA_ID,
        nombre: 'Firulais',
        estado: 'en_casa',
      });
      mockPrisma.reporteExtravio.updateMany.mockResolvedValue({ count: 1 });

      await service.updateStatus(MASCOTA_ID, PERSONA_ID, 'en_casa');

      expect(mockPrisma.reporteExtravio.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { mascotaId: MASCOTA_ID, estadoReporte: 'abierto' },
          data: { estadoReporte: 'cerrado' },
        }),
      );
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('no-existe', PERSONA_ID, EstadoMascota.en_casa),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascota,
        propietarios: [{ personaId: 'otro-uuid' }],
      });

      await expect(
        service.updateStatus(MASCOTA_ID, PERSONA_ID, EstadoMascota.extraviada),
      ).rejects.toThrow(ForbiddenException);
    });

    it('emite pet:status-changed vía WebSocket', async () => {
      mockPrisma.reporteExtravio.findFirst.mockResolvedValue({ reporteId: 1 });

      await service.updateStatus(MASCOTA_ID, PERSONA_ID, 'extraviada');

      expect(mockRealtime.emitPetStatusChanged).toHaveBeenCalledWith(
        expect.objectContaining({ mascotaId: MASCOTA_ID, estado: 'extraviada' }),
      );
    });
  });

  // ───────────────────────── updateReward ──────────────────────

  describe('updateReward', () => {
    beforeEach(() => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
    });

    it('actualiza la recompensa cuando hay reporte abierto', async () => {
      mockPrisma.reporteExtravio.findFirst.mockResolvedValue({ reporteId: 3 });
      mockPrisma.reporteExtravio.update.mockResolvedValue({});

      const result = await service.updateReward(MASCOTA_ID, PERSONA_ID, 200);

      expect(mockPrisma.reporteExtravio.update).toHaveBeenCalledWith({
        where: { reporteId: 3 },
        data: { recompensa: 200 },
      });
      expect(result).toEqual({ mascotaId: MASCOTA_ID, recompensa: 200 });
    });

    it('lanza BadRequestException si la mascota no está extraviada', async () => {
      mockPrisma.reporteExtravio.findFirst.mockResolvedValue(null);

      await expect(service.updateReward(MASCOTA_ID, PERSONA_ID, 200)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.updateReward('no-existe', PERSONA_ID, 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascota,
        propietarios: [{ personaId: 'otro-persona-id' }],
      });

      await expect(service.updateReward(MASCOTA_ID, PERSONA_ID, 100)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───────────────────────── findPetCard ───────────────────────

  describe('findPetCard', () => {
    const mockMascotaCard = {
      mascotaId: MASCOTA_ID,
      nombre: 'Firulais',
      sexo: 'M',
      colorPrimario: 'Café',
      rasgosParticulares: null,
      estado: 'en_casa',
      tipoMascota: null,
      fotos: [],
      fichaMedica: null,
      registrosMedicos: [],
      propietarios: [
        {
          tipoRelacion: 'Dueno_Principal',
          mostrarEnQr: true,
          persona: {
            personaId: PERSONA_ID,
            nombre: 'Juan',
            apellidoPaterno: 'Pérez',
            fotoPerfilUrl: null,
            mediosContacto: [],
          },
        },
      ],
      reportesExtravio: [],
    };

    it('retorna la tarjeta pública de la mascota', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascotaCard);

      const result = await service.findPetCard(MASCOTA_ID);

      expect(result.mascotaId).toBe(MASCOTA_ID);
      expect(result.nombre).toBe('Firulais');
      expect(result.estaExtraviada).toBe(false);
      expect(result.propietarios).toHaveLength(1);
    });

    it('incluye reporteActivo si hay reporte abierto', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascotaCard,
        estado: 'extraviada',
        reportesExtravio: [{ recompensa: 500, fechaPerdida: new Date() }],
      });

      const result = await service.findPetCard(MASCOTA_ID);

      expect(result.estaExtraviada).toBe(true);
      expect(result.reporteActivo).not.toBeNull();
    });

    it('excluye propietarios con mostrarEnQr = false', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascotaCard,
        propietarios: [{ ...mockMascotaCard.propietarios[0], mostrarEnQr: false }],
      });

      const result = await service.findPetCard(MASCOTA_ID);

      expect(result.propietarios).toHaveLength(0);
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.findPetCard('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── getPetByToken ─────────────────────

  describe('getPetByToken', () => {
    it('retorna la tarjeta de la mascota por token activo', async () => {
      mockPrisma.placaQr.findUnique.mockResolvedValue(mockPlaca);
      mockPrisma.mascota.findUnique.mockResolvedValue({
        mascotaId: MASCOTA_ID,
        nombre: 'Firulais',
        sexo: 'M',
        colorPrimario: 'Café',
        rasgosParticulares: null,
        estado: 'en_casa',
        tipoMascota: null,
        fotos: [],
        fichaMedica: null,
        registrosMedicos: [],
        propietarios: [],
        reportesExtravio: [],
      });

      const result = await service.getPetByToken(TOKEN_ACCESO);

      expect(result.mascotaId).toBe(MASCOTA_ID);
    });

    it('lanza NotFoundException si el token no existe', async () => {
      mockPrisma.placaQr.findUnique.mockResolvedValue(null);

      await expect(service.getPetByToken('token-invalido')).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si la placa está desactivada', async () => {
      mockPrisma.placaQr.findUnique.mockResolvedValue({ ...mockPlaca, estaActiva: false });

      await expect(service.getPetByToken(TOKEN_ACCESO)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── registerScan ──────────────────────

  describe('registerScan', () => {
    const mockEscaneo = {
      escaneoId: 'scan-uuid',
      mascotaId: MASCOTA_ID,
      lat: -17.78,
      lng: -63.18,
      escaneadoEl: new Date(),
    };

    it('registra el escaneo con coordenadas', async () => {
      mockPrisma.placaQr.findUnique.mockResolvedValue(mockPlaca);
      mockPrisma.escaneoQr.create.mockResolvedValue(mockEscaneo);

      const result = await service.registerScan(TOKEN_ACCESO, { lat: -17.78, lng: -63.18 });

      expect(result.escaneoId).toBe('scan-uuid');
      expect(mockPrisma.escaneoQr.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mascotaId: MASCOTA_ID, lat: -17.78, lng: -63.18 }),
        }),
      );
    });

    it('registra el escaneo sin coordenadas cuando no se proveen', async () => {
      mockPrisma.placaQr.findUnique.mockResolvedValue(mockPlaca);
      mockPrisma.escaneoQr.create.mockResolvedValue({ ...mockEscaneo, lat: null, lng: null });

      await service.registerScan(TOKEN_ACCESO, {});

      expect(mockPrisma.escaneoQr.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lat: null, lng: null }),
        }),
      );
    });

    it('lanza NotFoundException si el token no existe', async () => {
      mockPrisma.placaQr.findUnique.mockResolvedValue(null);

      await expect(service.registerScan('token-invalido', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si la placa está desactivada', async () => {
      mockPrisma.placaQr.findUnique.mockResolvedValue({ ...mockPlaca, estaActiva: false });

      await expect(service.registerScan(TOKEN_ACCESO, {})).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── getScans ──────────────────────────

  describe('getScans', () => {
    it('retorna el historial de escaneos de la mascota', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.escaneoQr.findMany.mockResolvedValue([{ escaneoId: 'scan-1' }]);

      const result = await service.getScans(MASCOTA_ID, PERSONA_ID);

      expect(result).toHaveLength(1);
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascota,
        propietarios: [{ personaId: 'otro-uuid' }],
      });

      await expect(service.getScans(MASCOTA_ID, PERSONA_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────── getMedicalRecords ─────────────────

  describe('getMedicalRecords', () => {
    it('retorna registros médicos ordenados de la mascota', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.registroMedico.findMany.mockResolvedValue([{ registroId: 1, tipo: 'Vacuna' }]);

      const result = await service.getMedicalRecords(MASCOTA_ID, PERSONA_ID);

      expect(result).toHaveLength(1);
      expect(result[0].tipo).toBe('Vacuna');
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascota,
        propietarios: [{ personaId: 'otro-uuid' }],
      });

      await expect(service.getMedicalRecords(MASCOTA_ID, PERSONA_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───────────────────────── addMedicalRecord ──────────────────

  describe('addMedicalRecord', () => {
    it('crea un nuevo registro médico', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.registroMedico.create.mockResolvedValue({
        registroId: 1,
        tipo: 'Vacuna',
        descripcion: 'Antirrábica',
        fecha: new Date('2026-05-01'),
        veterinario: 'Dr. Pérez',
      });

      const result = await service.addMedicalRecord(MASCOTA_ID, PERSONA_ID, {
        tipo: 'Vacuna',
        descripcion: 'Antirrábica',
        fecha: '2026-05-01',
        veterinario: 'Dr. Pérez',
      });

      expect(result.tipo).toBe('Vacuna');
      expect(mockPrisma.registroMedico.create).toHaveBeenCalledTimes(1);
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(
        service.addMedicalRecord('no-existe', PERSONA_ID, { tipo: 'Vacuna', descripcion: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── updateMedicalRecord ───────────────

  describe('updateMedicalRecord', () => {
    const mockRegistro = { registroId: 1, mascotaId: MASCOTA_ID, tipo: 'Vacuna' };

    it('actualiza el registro médico', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.registroMedico.findUnique.mockResolvedValue(mockRegistro);
      mockPrisma.registroMedico.update.mockResolvedValue({ ...mockRegistro, tipo: 'Consulta' });

      const result = await service.updateMedicalRecord(MASCOTA_ID, PERSONA_ID, 1, {
        tipo: 'Consulta',
      });

      expect(result.tipo).toBe('Consulta');
    });

    it('lanza NotFoundException si el registro no pertenece a la mascota', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.registroMedico.findUnique.mockResolvedValue({
        ...mockRegistro,
        mascotaId: 'otra-mascota',
      });

      await expect(service.updateMedicalRecord(MASCOTA_ID, PERSONA_ID, 1, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si el registro no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.registroMedico.findUnique.mockResolvedValue(null);

      await expect(service.updateMedicalRecord(MASCOTA_ID, PERSONA_ID, 99, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────── updatePetLocation ───────────────────

  describe('updatePetLocation', () => {
    beforeEach(() => {
      mockPrisma.mascota.findUnique.mockResolvedValue(mockMascota);
      mockPrisma.$executeRaw.mockResolvedValue(1);
    });

    it('ejecuta UPDATE con las coordenadas recibidas', async () => {
      await service.updatePetLocation(MASCOTA_ID, PERSONA_ID, -17.4, -66.15);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('retorna mensaje de confirmación', async () => {
      const result = await service.updatePetLocation(MASCOTA_ID, PERSONA_ID, -17.4, -66.15);

      expect(result).toEqual({ message: 'Ubicación de la mascota actualizada' });
    });

    it('emite pet:location-updated con las coordenadas correctas', async () => {
      await service.updatePetLocation(MASCOTA_ID, PERSONA_ID, -17.4, -66.15);

      expect(mockRealtime.emitPetLocationUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ mascotaId: MASCOTA_ID, lat: -17.4, lng: -66.15 }),
      );
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePetLocation('no-existe', PERSONA_ID, -17.4, -66.15),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue({
        ...mockMascota,
        propietarios: [{ personaId: 'otro-uuid' }],
      });

      await expect(
        service.updatePetLocation(MASCOTA_ID, PERSONA_ID, -17.4, -66.15),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
