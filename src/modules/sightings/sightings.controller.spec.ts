import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { SightingsController } from './sightings.controller';
import { SightingsService } from './sightings.service';
import { ChatsService } from '../chats/chats.service';
import { CreateSightingDto } from './dto/create-sighting.dto';
import { CreateThanksDto } from './dto/create-thanks.dto';

const MASCOTA_ID = 'mascota-uuid';
const AVISTAMIENTO_ID = 'avist-uuid';
const USUARIO_ID = 'usuario-uuid';
const PERSONA_ID = 'persona-uuid';

const mockSightingsService = {
  createSighting: jest.fn(),
  getSightings: jest.fn(),
  createThanks: jest.fn(),
  getThanks: jest.fn(),
};

const mockChatsService = { initChat: jest.fn() };

const mockJwtService = { verifyAsync: jest.fn() };

describe('SightingsController', () => {
  let controller: SightingsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SightingsController],
      providers: [
        { provide: SightingsService, useValue: mockSightingsService },
        { provide: ChatsService, useValue: mockChatsService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<SightingsController>(SightingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ───────────────────────── createSighting ────────────────────

  describe('createSighting', () => {
    it('delega al service sin archivo cuando no se envía foto', async () => {
      const dto: CreateSightingDto = { lat: -17.78, lng: -63.18 };
      mockSightingsService.createSighting.mockResolvedValue({ avistamientoId: AVISTAMIENTO_ID });

      await controller.createSighting(MASCOTA_ID, dto, undefined, undefined);

      expect(mockSightingsService.createSighting).toHaveBeenCalledWith(
        MASCOTA_ID,
        dto,
        undefined,
        undefined,
      );
    });

    it('delega al service con archivo cuando se envía foto', async () => {
      const dto: CreateSightingDto = { lat: -17.78, lng: -63.18 };
      const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as Express.Multer.File;
      mockSightingsService.createSighting.mockResolvedValue({ avistamientoId: AVISTAMIENTO_ID });

      await controller.createSighting(MASCOTA_ID, dto, file, undefined);

      expect(mockSightingsService.createSighting).toHaveBeenCalledWith(
        MASCOTA_ID,
        dto,
        file,
        undefined,
      );
    });

    it('delega rescatistaUsuarioId al service cuando hay JWT', async () => {
      const dto: CreateSightingDto = { lat: -17.78, lng: -63.18 };
      mockSightingsService.createSighting.mockResolvedValue({ avistamientoId: AVISTAMIENTO_ID });

      await controller.createSighting(MASCOTA_ID, dto, undefined, USUARIO_ID);

      expect(mockSightingsService.createSighting).toHaveBeenCalledWith(
        MASCOTA_ID,
        dto,
        undefined,
        USUARIO_ID,
      );
    });

    it('retorna el resultado del service', async () => {
      const expected = { avistamientoId: AVISTAMIENTO_ID, lat: -17.78, lng: -63.18 };
      mockSightingsService.createSighting.mockResolvedValue(expected);

      const result = await controller.createSighting(
        MASCOTA_ID,
        { lat: -17.78, lng: -63.18 },
        undefined,
        undefined,
      );

      expect(result).toEqual(expected);
    });
  });

  // ───────────────────────── getSightings ──────────────────────

  describe('getSightings', () => {
    it('delega al service con mascotaId y personaId del JWT', async () => {
      mockSightingsService.getSightings.mockResolvedValue([]);

      await controller.getSightings(MASCOTA_ID, PERSONA_ID);

      expect(mockSightingsService.getSightings).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
    });

    it('retorna la lista de avistamientos', async () => {
      const avistamientos = [{ avistamientoId: AVISTAMIENTO_ID }];
      mockSightingsService.getSightings.mockResolvedValue(avistamientos);

      const result = await controller.getSightings(MASCOTA_ID, PERSONA_ID);

      expect(result).toEqual(avistamientos);
    });
  });

  // ───────────────────────── createThanks ──────────────────────

  describe('createThanks', () => {
    it('delega al service con avistamientoId, usuarioId y dto', async () => {
      const dto: CreateThanksDto = { mensaje: '¡Gracias!' };
      mockSightingsService.createThanks.mockResolvedValue({ agradecimientoId: 1 });

      await controller.createThanks(AVISTAMIENTO_ID, USUARIO_ID, dto);

      expect(mockSightingsService.createThanks).toHaveBeenCalledWith(
        AVISTAMIENTO_ID,
        USUARIO_ID,
        dto,
      );
    });
  });

  // ───────────────────────── getThanks ─────────────────────────

  describe('getThanks', () => {
    it('delega al service con avistamientoId', async () => {
      mockSightingsService.getThanks.mockResolvedValue([]);

      await controller.getThanks(AVISTAMIENTO_ID);

      expect(mockSightingsService.getThanks).toHaveBeenCalledWith(AVISTAMIENTO_ID);
    });

    it('retorna la lista de agradecimientos', async () => {
      const agradecimientos = [{ agradecimientoId: 1, mensaje: '¡Gracias!' }];
      mockSightingsService.getThanks.mockResolvedValue(agradecimientos);

      const result = await controller.getThanks(AVISTAMIENTO_ID);

      expect(result).toEqual(agradecimientos);
    });
  });
});
