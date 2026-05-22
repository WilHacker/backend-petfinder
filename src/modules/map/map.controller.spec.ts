import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { MapController } from './map.controller';
import { MapService } from './map.service';

const PERSONA_ID = 'persona-uuid';

const mockMapService = {
  getSnapshot: jest.fn(),
  getPublicLostPets: jest.fn(),
};

const mockJwtService = { verifyAsync: jest.fn() };

describe('MapController', () => {
  let controller: MapController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MapController],
      providers: [
        { provide: MapService, useValue: mockMapService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<MapController>(MapController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ───────────────────────── getSnapshot ───────────────────────

  describe('getSnapshot', () => {
    it('delega al service con personaId del JWT sin tipoId', async () => {
      const snapshot = { marcadores: { usuariosCompartidos: [], desaparecidas: [] }, zonas: [] };
      mockMapService.getSnapshot.mockResolvedValue(snapshot);

      const result = await controller.getSnapshot(PERSONA_ID, undefined);

      expect(mockMapService.getSnapshot).toHaveBeenCalledWith(PERSONA_ID, undefined);
      expect(result).toEqual(snapshot);
    });

    it('pasa tipoId al service cuando se provee como query param', async () => {
      mockMapService.getSnapshot.mockResolvedValue({ marcadores: {}, zonas: [] });

      await controller.getSnapshot(PERSONA_ID, 2);

      expect(mockMapService.getSnapshot).toHaveBeenCalledWith(PERSONA_ID, 2);
    });

    it('retorna la estructura completa del snapshot', async () => {
      const expected = {
        marcadores: {
          usuariosCompartidos: [{ personaId: 'p1', nombre: 'Ana García' }],
          desaparecidas: [],
        },
        zonas: [{ zonaId: 1, tipo: 'circulo' }],
      };
      mockMapService.getSnapshot.mockResolvedValue(expected);

      const result = await controller.getSnapshot(PERSONA_ID, undefined);

      expect(result).toEqual(expected);
    });
  });

  // ─────────────────────── getPublicLostPets ───────────────────

  describe('getPublicLostPets', () => {
    it('delega al service sin tipoId', async () => {
      mockMapService.getPublicLostPets.mockResolvedValue([]);

      const result = await controller.getPublicLostPets(undefined);

      expect(mockMapService.getPublicLostPets).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([]);
    });

    it('pasa tipoId al service cuando se provee', async () => {
      mockMapService.getPublicLostPets.mockResolvedValue([]);

      await controller.getPublicLostPets(1);

      expect(mockMapService.getPublicLostPets).toHaveBeenCalledWith(1);
    });

    it('retorna la lista de mascotas perdidas', async () => {
      const lostPets = [
        {
          reporteId: 5,
          mascotaId: 'mascota-uuid',
          nombre: 'Max',
          tipo: 'Perro',
          fotoUrl: null,
          lat: -17.5,
          lng: -66.2,
        },
      ];
      mockMapService.getPublicLostPets.mockResolvedValue(lostPets);

      const result = await controller.getPublicLostPets(undefined);

      expect(result).toEqual(lostPets);
    });
  });
});
