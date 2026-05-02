import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { GeofencingService } from './geofencing.service';

const PERSONA_ID = 'persona-uuid';
const MASCOTA_ID = 'mascota-uuid';
const ZONA_ID = 1;

const mockRelacion = { personaId: PERSONA_ID, mascotaId: MASCOTA_ID };

const mockZona = {
  zonaId: ZONA_ID,
  mascotaId: MASCOTA_ID,
  nombreZona: 'Casa',
  radioMetros: 200,
  estaActiva: true,
};

const mockZonaRaw = {
  zona_id: ZONA_ID,
  nombre_zona: 'Casa',
  radio_metros: 200,
  esta_activa: true,
  centro_lat: -17.78,
  centro_lng: -63.18,
  geometria_geojson: null,
};

const mockPrisma = {
  propietarioMascota: {
    findUnique: jest.fn(),
  },
  zonaSegura: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
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
    });

    it('inserta zona de tipo círculo con $executeRaw', async () => {
      mockPrisma.zonaSegura.findFirst.mockResolvedValue(mockZona);

      await service.createZone(MASCOTA_ID, PERSONA_ID, {
        nombreZona: 'Casa',
        tipo: 'circulo',
        lat: -17.78,
        lng: -63.18,
        radioMetros: 200,
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.zonaSegura.findFirst).toHaveBeenCalled();
    });

    it('inserta zona de tipo polígono con $executeRaw', async () => {
      mockPrisma.zonaSegura.findFirst.mockResolvedValue(mockZona);

      await service.createZone(MASCOTA_ID, PERSONA_ID, {
        nombreZona: 'Parque',
        tipo: 'poligono',
        coordenadas: [
          { lat: -17.78, lng: -63.18 },
          { lat: -17.79, lng: -63.19 },
          { lat: -17.8, lng: -63.17 },
        ],
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
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
    it('retorna zonas del mapa con coordenadas extraídas por PostGIS', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.$queryRaw.mockResolvedValue([mockZonaRaw]);

      const result = await service.findZones(MASCOTA_ID, PERSONA_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('centro_lat');
    });
  });

  // ───────────────────────── findZone ──────────────────────────

  describe('findZone', () => {
    it('retorna detalle de la zona con geometría', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.$queryRaw.mockResolvedValue([mockZonaRaw]);

      const result = await service.findZone(MASCOTA_ID, ZONA_ID, PERSONA_ID);

      expect(result.zona_id).toBe(ZONA_ID);
      expect(result.geometria_geojson).toBeNull();
    });

    it('lanza NotFoundException si la zona no existe', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.findZone(MASCOTA_ID, 99, PERSONA_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── updateZone ────────────────────────

  describe('updateZone', () => {
    it('actualiza el nombre de la zona', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.zonaSegura.findFirst.mockResolvedValue(mockZona);
      mockPrisma.zonaSegura.update.mockResolvedValue({ ...mockZona, nombreZona: 'Trabajo' });
      mockPrisma.zonaSegura.findUnique.mockResolvedValue({ ...mockZona, nombreZona: 'Trabajo' });

      const result = await service.updateZone(MASCOTA_ID, ZONA_ID, PERSONA_ID, {
        nombreZona: 'Trabajo',
      });

      expect(result?.nombreZona).toBe('Trabajo');
    });

    it('actualiza geometría de círculo con $executeRaw', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.zonaSegura.findFirst.mockResolvedValue(mockZona);
      mockPrisma.zonaSegura.findUnique.mockResolvedValue(mockZona);

      await service.updateZone(MASCOTA_ID, ZONA_ID, PERSONA_ID, {
        tipo: 'circulo',
        lat: -17.8,
        lng: -63.2,
        radioMetros: 300,
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('lanza NotFoundException si la zona no existe', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.zonaSegura.findFirst.mockResolvedValue(null);

      await expect(
        service.updateZone(MASCOTA_ID, ZONA_ID, PERSONA_ID, { nombreZona: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── removeZone ────────────────────────

  describe('removeZone', () => {
    it('elimina la zona y retorna mensaje de confirmación', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.zonaSegura.findFirst.mockResolvedValue(mockZona);
      mockPrisma.zonaSegura.delete.mockResolvedValue(mockZona);

      const result = await service.removeZone(MASCOTA_ID, ZONA_ID, PERSONA_ID);

      expect(result).toEqual({ message: 'Zona eliminada' });
      expect(mockPrisma.zonaSegura.delete).toHaveBeenCalledWith({ where: { zonaId: ZONA_ID } });
    });

    it('lanza NotFoundException si la zona no existe', async () => {
      mockPrisma.propietarioMascota.findUnique.mockResolvedValue(mockRelacion);
      mockPrisma.zonaSegura.findFirst.mockResolvedValue(null);

      await expect(service.removeZone(MASCOTA_ID, ZONA_ID, PERSONA_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
