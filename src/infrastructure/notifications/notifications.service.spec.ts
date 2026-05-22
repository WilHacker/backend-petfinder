import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

jest.mock('firebase-admin', () => ({
  apps: [],
  app: jest.fn(),
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: jest.fn().mockReturnValue({
    sendEachForMulticast: jest.fn().mockResolvedValue({ responses: [] }),
  }),
}));

const mockPrisma = {
  propietarioMascota: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue(null),
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let sendEachForMulticast: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    // Simula Firebase inicializado para todos los tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).app = {};
    // Obtiene la referencia al mock de sendEachForMulticast
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendEachForMulticast = (admin.messaging() as any).sendEachForMulticast as jest.Mock;
    sendEachForMulticast.mockResolvedValue({ responses: [] });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────── sendPetLostAlert ────────────────────

  describe('sendPetLostAlert', () => {
    it('no hace nada si Firebase no está inicializado (app null)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).app = null;

      await service.sendPetLostAlert('mascota-uuid');

      expect(mockPrisma.propietarioMascota.findMany).not.toHaveBeenCalled();
    });

    it('no envía FCM si ningún propietario tiene token', async () => {
      mockPrisma.propietarioMascota.findMany.mockResolvedValue([
        { mascota: { nombre: 'Rex' }, persona: { usuario: null } },
        { mascota: { nombre: 'Rex' }, persona: { usuario: { tokenFcm: null } } },
      ]);

      await service.sendPetLostAlert('mascota-uuid');

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('envía FCM con tipo mascota_extraviada a propietarios con token', async () => {
      mockPrisma.propietarioMascota.findMany.mockResolvedValue([
        { mascota: { nombre: 'Rex' }, persona: { usuario: { tokenFcm: 'tok-1' } } },
        { mascota: { nombre: 'Rex' }, persona: { usuario: { tokenFcm: 'tok-2' } } },
      ]);

      await service.sendPetLostAlert('mascota-uuid');

      expect(sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['tok-1', 'tok-2'],
          notification: expect.objectContaining({
            title: expect.stringContaining('Rex'),
          }),
          data: expect.objectContaining({
            mascotaId: 'mascota-uuid',
            tipo: 'mascota_extraviada',
          }),
        }),
      );
    });

    it('no lanza si la BD falla (captura el error internamente)', async () => {
      mockPrisma.propietarioMascota.findMany.mockRejectedValue(new Error('DB error'));

      await expect(service.sendPetLostAlert('mascota-uuid')).resolves.toBeUndefined();
    });
  });

  // ─────────────────────── sendQrScanAlert ─────────────────────

  describe('sendQrScanAlert', () => {
    it('no hace nada si Firebase no está inicializado', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).app = null;

      await service.sendQrScanAlert('mascota-uuid', -17.78, -63.18);

      expect(mockPrisma.propietarioMascota.findMany).not.toHaveBeenCalled();
    });

    it('no envía FCM si no hay tokens registrados', async () => {
      mockPrisma.propietarioMascota.findMany.mockResolvedValue([
        { mascota: { nombre: 'Luna' }, persona: { usuario: { tokenFcm: null } } },
      ]);

      await service.sendQrScanAlert('mascota-uuid', -17.78, -63.18);

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('envía FCM con tipo qr_escaneado y coordenadas como strings', async () => {
      mockPrisma.propietarioMascota.findMany.mockResolvedValue([
        { mascota: { nombre: 'Luna' }, persona: { usuario: { tokenFcm: 'tok-owner' } } },
      ]);

      await service.sendQrScanAlert('mascota-uuid', -17.78, -63.18);

      expect(sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['tok-owner'],
          data: expect.objectContaining({
            tipo: 'qr_escaneado',
            lat: '-17.78',
            lng: '-63.18',
          }),
        }),
      );
    });
  });

  // ─────────────────────── sendRadiusAlert ─────────────────────

  describe('sendRadiusAlert', () => {
    it('no hace nada si Firebase no está inicializado', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).app = null;

      await service.sendRadiusAlert('mascota-uuid');

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('no envía FCM si la mascota no tiene ubicación conocida', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // sin ubicación

      await service.sendRadiusAlert('mascota-uuid');

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('no envía FCM si no hay usuarios en el radio', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ lat: -17.78, lng: -63.18, nombre: 'Rex' }])
        .mockResolvedValueOnce([]); // sin usuarios

      await service.sendRadiusAlert('mascota-uuid');

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('envía FCM con tipo alerta_radio a usuarios en el radio', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ lat: -17.78, lng: -63.18, nombre: 'Rex' }])
        .mockResolvedValueOnce([{ token_fcm: 'tok-cerca' }]);

      await service.sendRadiusAlert('mascota-uuid');

      expect(sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['tok-cerca'],
          data: expect.objectContaining({ tipo: 'alerta_radio' }),
        }),
      );
    });
  });

  // ─────────────────────── sendZoneAlert ───────────────────────

  describe('sendZoneAlert', () => {
    it('no hace nada si Firebase no está inicializado', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).app = null;

      await service.sendZoneAlert('mascota-uuid');

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('no envía FCM si la mascota no tiene ubicación conocida', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service.sendZoneAlert('mascota-uuid');

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('no envía FCM si no hay usuarios con zonas cercanas', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ lat: -17.78, lng: -63.18, nombre: 'Rex' }])
        .mockResolvedValueOnce([]);

      await service.sendZoneAlert('mascota-uuid');

      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('envía FCM con tipo mascota_en_zona a usuarios con zonas cercanas', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ lat: -17.78, lng: -63.18, nombre: 'Rex' }])
        .mockResolvedValueOnce([{ token_fcm: 'tok-zona' }]);

      await service.sendZoneAlert('mascota-uuid');

      expect(sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['tok-zona'],
          notification: expect.objectContaining({
            title: expect.stringContaining('zona'),
          }),
          data: expect.objectContaining({ tipo: 'mascota_en_zona' }),
        }),
      );
    });
  });
});
