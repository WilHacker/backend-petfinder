import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SightingsService } from './sightings.service';

const MASCOTA_ID = 'mascota-uuid';
const AVISTAMIENTO_ID = 'avist-uuid';
const USUARIO_ID = 'usuario-uuid';
const PERSONA_ID = 'persona-uuid';
const FOTO_URL = 'https://res.cloudinary.com/test/avistamientos/foto.jpg';

const mockAvistamientoRow = {
  avistamiento_id: AVISTAMIENTO_ID,
  mascota_id: MASCOTA_ID,
  mensaje_rescatista: 'Lo vi en el parque',
  foto_evidencia_url: null,
  fecha_avistamiento: new Date('2026-05-20T10:00:00Z'),
  lat: -17.78,
  lng: -63.18,
};

const mockAvistamiento = {
  avistamientoId: AVISTAMIENTO_ID,
  mascotaId: MASCOTA_ID,
  mascota: {
    propietarios: [
      {
        persona: {
          usuario: { usuarioId: USUARIO_ID },
        },
      },
    ],
  },
};

const mockPrisma = {
  mascota: { findUnique: jest.fn() },
  avistamiento: { findUnique: jest.fn() },
  agradecimientoRescatista: { create: jest.fn(), findMany: jest.fn() },
  propietarioMascota: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
};

const mockCloudinary = {
  uploadBuffer: jest.fn(),
  deleteByUrl: jest.fn(),
};

describe('SightingsService', () => {
  let service: SightingsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SightingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CloudinaryService, useValue: mockCloudinary },
      ],
    }).compile();

    service = module.get<SightingsService>(SightingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── createSighting ────────────────────

  describe('createSighting', () => {
    const dto = { lat: -17.78, lng: -63.18, mensajeRescatista: 'Lo vi en el parque' };

    beforeEach(() => {
      mockPrisma.mascota.findUnique.mockResolvedValue({ mascotaId: MASCOTA_ID });
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ avistamiento_id: AVISTAMIENTO_ID }]) // INSERT RETURNING
        .mockResolvedValueOnce([mockAvistamientoRow]); // findSighting
    });

    it('crea un avistamiento sin foto', async () => {
      const result = await service.createSighting(MASCOTA_ID, dto);

      expect(mockCloudinary.uploadBuffer).not.toHaveBeenCalled();
      expect(result.avistamientoId).toBe(AVISTAMIENTO_ID);
      expect(result.lat).toBe(-17.78);
    });

    it('sube foto a Cloudinary cuando se envía archivo', async () => {
      mockCloudinary.uploadBuffer.mockResolvedValue({ secure_url: FOTO_URL });
      const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as Express.Multer.File;

      await service.createSighting(MASCOTA_ID, dto, file);

      expect(mockCloudinary.uploadBuffer).toHaveBeenCalledWith(
        file.buffer,
        `avistamientos/${MASCOTA_ID}`,
      );
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      mockPrisma.mascota.findUnique.mockResolvedValue(null);

      await expect(service.createSighting('no-existe', dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── getSightings ──────────────────────

  describe('getSightings', () => {
    it('retorna avistamientos de la mascota cuando el usuario tiene acceso', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue({ personaId: PERSONA_ID });
      mockPrisma.$queryRaw.mockResolvedValue([mockAvistamientoRow]);

      const result = await service.getSightings(MASCOTA_ID, PERSONA_ID);

      expect(result).toHaveLength(1);
      expect(result[0].avistamientoId).toBe(AVISTAMIENTO_ID);
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(null);

      await expect(service.getSightings(MASCOTA_ID, 'otro-persona')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───────────────────────── createThanks ──────────────────────

  describe('createThanks', () => {
    const dto = { mensaje: '¡Gracias por encontrar a Rex!' };

    it('crea el agradecimiento cuando el usuario es propietario', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(mockAvistamiento);
      mockPrisma.agradecimientoRescatista.create.mockResolvedValue({
        agradecimientoId: 1,
        mensaje: dto.mensaje,
      });

      const result = await service.createThanks(AVISTAMIENTO_ID, USUARIO_ID, dto);

      expect(result.agradecimientoId).toBe(1);
      expect(mockPrisma.agradecimientoRescatista.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avistamientoId: AVISTAMIENTO_ID, mensaje: dto.mensaje }),
        }),
      );
    });

    it('lanza NotFoundException si el avistamiento no existe', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(null);

      await expect(service.createThanks(AVISTAMIENTO_ID, USUARIO_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si el usuario no es propietario de la mascota', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue({
        ...mockAvistamiento,
        mascota: {
          propietarios: [{ persona: { usuario: { usuarioId: 'otro-usuario' } } }],
        },
      });

      await expect(service.createThanks(AVISTAMIENTO_ID, USUARIO_ID, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───────────────────────── getThanks ─────────────────────────

  describe('getThanks', () => {
    it('retorna lista de agradecimientos del avistamiento', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue({ avistamientoId: AVISTAMIENTO_ID });
      mockPrisma.agradecimientoRescatista.findMany.mockResolvedValue([
        {
          agradecimientoId: 1,
          avistamientoId: AVISTAMIENTO_ID,
          mensaje: '¡Gracias!',
          creadoEl: new Date(),
          autor: {
            usuarioId: USUARIO_ID,
            persona: { nombre: 'Juan', apellidoPaterno: 'Pérez', fotoPerfilUrl: null },
          },
        },
      ]);

      const result = await service.getThanks(AVISTAMIENTO_ID);

      expect(result).toHaveLength(1);
      expect(result[0].agradecimientoId).toBe(1);
    });

    it('lanza NotFoundException si el avistamiento no existe', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(null);

      await expect(service.getThanks('no-existe')).rejects.toThrow(NotFoundException);
    });

    it('retorna array vacío si no hay agradecimientos', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue({ avistamientoId: AVISTAMIENTO_ID });
      mockPrisma.agradecimientoRescatista.findMany.mockResolvedValue([]);

      const result = await service.getThanks(AVISTAMIENTO_ID);

      expect(result).toHaveLength(0);
    });
  });
});
