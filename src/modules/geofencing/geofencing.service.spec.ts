import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { GeofencingService } from './geofencing.service';

const PERSONA_ID = 'persona-uuid';
const MASCOTA_ID = 'mascota-uuid';
const ZONA_ID = 1;

const mockRelacion = { personaId: PERSONA_ID, mascotaId: MASCOTA_ID };
const mockZonaMascotaRel = { zonaId: ZONA_ID, mascotaId: MASCOTA_ID };

// Forma que devuelve el $queryRaw de findZone (incluye mascota_ids)
const mockZonaDetailRaw = {
  zona_id: ZONA_ID,
  nombre_zona: 'Casa',
  radio_metros: 200,
  esta_activa: true,
  centro_lat: -17.78,
  centro_lng: -63.18,
  geometria_geojson: null,
  mascota_ids: [MASCOTA_ID],
};

const mockPrisma = {
  propietarioMascota: { findUnique: jest.fn() },
  zonaMascota: { findFirst: jest.fn(), createMany: jest.fn() },
  zonaSegura: { update: jest.fn(), delete: jest.fn() },
  $executeRaw: jest.fn().mockResolvedValue(1),
  $queryRaw: jest.fn(),
};

describe('GeofencingService', () => {
  let service: GeofencingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeofencingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GeofencingService>(GeofencingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── createZone ────────────────────────

  describe('createZone', () => {
    beforeEach(() => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.zonaMascota.findFirst.mockResolvedValue(mockZonaMascotaRel);
      mockPrisma.zonaMascota.createMany.mockResolvedValue({ count: 1 });
    });

    it('crea zona de tipo círculo, asocia la mascota y retorna el detalle', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ zona_id: ZONA_ID }]) // INSERT ... RETURNING zona_id
        .mockResolvedValueOnce([mockZonaDetailRaw]); // findZone SELECT

      const result = await service.createZone(MASCOTA_ID, PERSONA_ID, {
        nombreZona: 'Casa',
        tipo: 'circulo',
        lat: -17.78,
        lng: -63.18,
        radioMetros: 200,
      });

      expect(mockPrisma.zonaMascota.createMany).toHaveBeenCalledWith({
        data: [{ zonaId: ZONA_ID, mascotaId: MASCOTA_ID }],
        skipDuplicates: true,
      });
      expect(result?.zona_id).toBe(ZONA_ID);
    });

    it('crea zona de tipo polígono y asocia la mascota', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ zona_id: ZONA_ID }])
        .mockResolvedValueOnce([mockZonaDetailRaw]);

      await service.createZone(MASCOTA_ID, PERSONA_ID, {
        nombreZona: 'Parque',
        tipo: 'poligono',
        coordenadas: [
          { lat: -17.78, lng: -63.18 },
          { lat: -17.79, lng: -63.19 },
          { lat: -17.8, lng: -63.17 },
        ],
      });

      expect(mockPrisma.zonaMascota.createMany).toHaveBeenCalledTimes(1);
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(null);

      await expect(
        service.createZone(MASCOTA_ID, PERSONA_ID, {
          nombreZona: 'x',
          tipo: 'circulo',
          lat: 0,
          lng: 0,
          radioMetros: 50,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────── findZones ─────────────────────────

  describe('findZones', () => {
    it('retorna zonas con coordenadas extraídas por PostGIS', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.$queryRaw.mockResolvedValue([mockZonaDetailRaw]);

      const result = await service.findZones(MASCOTA_ID, PERSONA_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('centro_lat');
    });
  });

  // ───────────────────────── findZone ──────────────────────────

  describe('findZone', () => {
    it('retorna detalle de la zona con geometría', async () => {
      mockPrisma.zonaMascota.findFirst.mockResolvedValue(mockZonaMascotaRel);
      mockPrisma.$queryRaw.mockResolvedValue([mockZonaDetailRaw]);

      const result = await service.findZone(ZONA_ID, PERSONA_ID);

      expect(result.zona_id).toBe(ZONA_ID);
      expect(result.geometria_geojson).toBeNull();
    });

    it('lanza NotFoundException si la zona no existe', async () => {
      mockPrisma.zonaMascota.findFirst.mockResolvedValue(mockZonaMascotaRel);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.findZone(99, PERSONA_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── updateZone ────────────────────────

  describe('updateZone', () => {
    beforeEach(() => {
      mockPrisma.zonaMascota.findFirst.mockResolvedValue(mockZonaMascotaRel);
      mockPrisma.$queryRaw.mockResolvedValue([mockZonaDetailRaw]);
    });

    it('actualiza el nombre de la zona', async () => {
      mockPrisma.zonaSegura.update.mockResolvedValue({});

      await service.updateZone(ZONA_ID, PERSONA_ID, { nombreZona: 'Trabajo' });

      expect(mockPrisma.zonaSegura.update).toHaveBeenCalledWith({
        where: { zonaId: ZONA_ID },
        data: { nombreZona: 'Trabajo' },
      });
    });

    it('actualiza geometría de círculo con $executeRaw', async () => {
      await service.updateZone(ZONA_ID, PERSONA_ID, {
        tipo: 'circulo',
        lat: -17.8,
        lng: -63.2,
        radioMetros: 300,
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('lanza ForbiddenException si no tiene acceso a la zona', async () => {
      mockPrisma.zonaMascota.findFirst.mockResolvedValue(null);

      await expect(service.updateZone(ZONA_ID, PERSONA_ID, { nombreZona: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───────────────────────── removeZone ────────────────────────

  describe('removeZone', () => {
    it('elimina la zona y retorna mensaje de confirmación', async () => {
      mockPrisma.zonaMascota.findFirst.mockResolvedValue(mockZonaMascotaRel);
      mockPrisma.zonaSegura.delete.mockResolvedValue({});

      const result = await service.removeZone(ZONA_ID, PERSONA_ID);

      expect(result).toEqual({ message: 'Zona eliminada' });
      expect(mockPrisma.zonaSegura.delete).toHaveBeenCalledWith({ where: { zonaId: ZONA_ID } });
    });

    it('lanza ForbiddenException si no tiene acceso a la zona', async () => {
      mockPrisma.zonaMascota.findFirst.mockResolvedValue(null);

      await expect(service.removeZone(ZONA_ID, PERSONA_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});
