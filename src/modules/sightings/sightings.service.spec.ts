import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../infrastructure/notifications/notifications.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { SightingsService } from './sightings.service';

const MASCOTA_ID = 'mascota-uuid';
const AVISTAMIENTO_ID = 'avist-uuid';
const COMENTARIO_ID = 'comment-uuid';
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

const mockCommentRow = {
  comentario_id: COMENTARIO_ID,
  avistamiento_id: AVISTAMIENTO_ID,
  autor_usuario_id: USUARIO_ID,
  reply_to_user_id: null,
  mensaje: 'Vi al perro cerca del parque',
  foto_url: FOTO_URL,
  lat: -17.78,
  lng: -63.18,
  creado_el: new Date('2026-05-30T10:00:00Z'),
  autor_nombre: 'Juan',
  autor_apellido: 'Pérez',
  autor_foto_perfil: null,
};

const mockPrisma = {
  mascota: { findUnique: jest.fn() },
  avistamiento: { findUnique: jest.fn() },
  agradecimientoRescatista: { create: jest.fn(), findMany: jest.fn() },
  propietarioMascota: { findUnique: jest.fn() },
  comentarioAvistamiento: { findFirst: jest.fn() },
  lecturaComentario: { upsert: jest.fn() },
  $queryRaw: jest.fn(),
};

const mockCloudinary = {
  uploadBuffer: jest.fn(),
  deleteByUrl: jest.fn(),
};

const mockNotifications = {
  sendSightingAlert: jest.fn().mockResolvedValue(undefined),
  sendSightingCommentAlert: jest.fn().mockResolvedValue(undefined),
};

const mockRealtime = {
  emitSightingNew: jest.fn(),
  emitSightingCommentNew: jest.fn(),
  emitSightingRated: jest.fn(),
};

describe('SightingsService', () => {
  let service: SightingsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SightingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CloudinaryService, useValue: mockCloudinary },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: RealtimeService, useValue: mockRealtime },
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
      mockNotifications.sendSightingAlert.mockResolvedValue(undefined);
      mockPrisma.mascota.findUnique.mockResolvedValue({ mascotaId: MASCOTA_ID });
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ avistamiento_id: AVISTAMIENTO_ID }])
        .mockResolvedValueOnce([mockAvistamientoRow]);
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

    it('llama sendSightingAlert y emitSightingNew tras crear', async () => {
      await service.createSighting(MASCOTA_ID, dto);

      expect(mockNotifications.sendSightingAlert).toHaveBeenCalledWith(MASCOTA_ID);
      expect(mockRealtime.emitSightingNew).toHaveBeenCalledWith(
        MASCOTA_ID,
        expect.objectContaining({ avistamientoId: AVISTAMIENTO_ID }),
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

  // ───────────────────────── createComment ─────────────────────

  describe('createComment', () => {
    const dto = { mensaje: 'Vi al perro cerca del parque', lat: -17.78, lng: -63.18 };

    beforeEach(() => {
      mockNotifications.sendSightingCommentAlert.mockResolvedValue(undefined);
      mockPrisma.avistamiento.findUnique.mockResolvedValue({
        avistamientoId: AVISTAMIENTO_ID,
        mascotaId: MASCOTA_ID,
      });
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ comentario_id: COMENTARIO_ID }])
        .mockResolvedValueOnce([mockCommentRow]);
    });

    it('crea comentario con foto y guarda GPS', async () => {
      mockCloudinary.uploadBuffer.mockResolvedValue({ secure_url: FOTO_URL });
      const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as Express.Multer.File;

      const result = await service.createComment(AVISTAMIENTO_ID, USUARIO_ID, dto, file);

      expect(result.comentarioId).toBe(COMENTARIO_ID);
      expect(result.fotoUrl).toBe(FOTO_URL);
      expect(result.lat).toBe(-17.78);
    });

    it('crea comentario sin foto y GPS queda null aunque se envíe lat/lng', async () => {
      // Sin foto → GPS ignorado — sobrescribe los Once del beforeEach con datos sin GPS
      mockPrisma.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([{ comentario_id: COMENTARIO_ID }])
        .mockResolvedValueOnce([{ ...mockCommentRow, foto_url: null, lat: null, lng: null }]);

      const result = await service.createComment(AVISTAMIENTO_ID, USUARIO_ID, dto);

      expect(result.fotoUrl).toBeNull();
      expect(result.lat).toBeNull();
      expect(result.lng).toBeNull();
    });

    it('llama sendSightingCommentAlert y emitSightingCommentNew', async () => {
      await service.createComment(AVISTAMIENTO_ID, USUARIO_ID, dto);

      expect(mockNotifications.sendSightingCommentAlert).toHaveBeenCalledWith(
        MASCOTA_ID,
        AVISTAMIENTO_ID,
      );
      expect(mockRealtime.emitSightingCommentNew).toHaveBeenCalledWith(
        MASCOTA_ID,
        expect.objectContaining({ avistamientoId: AVISTAMIENTO_ID }),
      );
    });

    it('lanza BadRequestException si no hay ni mensaje ni foto', async () => {
      await expect(service.createComment(AVISTAMIENTO_ID, USUARIO_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si el avistamiento no existe', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(null);

      await expect(service.createComment('no-existe', USUARIO_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ───────────────────────── getComments ───────────────────────

  describe('getComments', () => {
    it('propietario recibe todos los comentarios', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(mockAvistamiento);
      mockPrisma.$queryRaw.mockResolvedValue([mockCommentRow]);

      const result = await service.getComments(AVISTAMIENTO_ID, USUARIO_ID);

      expect(result).toHaveLength(1);
      expect(result[0].comentarioId).toBe(COMENTARIO_ID);
      expect(result[0].autor?.nombre).toBe('Juan');
    });

    it('comentarista solo ve su hilo bilateral', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(mockAvistamiento);
      mockPrisma.$queryRaw.mockResolvedValue([mockCommentRow]);

      // Solicita con un usuario distinto al propietario
      const result = await service.getComments(AVISTAMIENTO_ID, 'otro-usuario');

      expect(result).toHaveLength(1);
    });

    it('lanza NotFoundException si el avistamiento no existe', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(null);

      await expect(service.getComments('no-existe', USUARIO_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── markAsRead ────────────────────────────────

  describe('markAsRead', () => {
    it('hace upsert de lectura cuando el avistamiento existe', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue({ avistamientoId: AVISTAMIENTO_ID });
      mockPrisma.lecturaComentario.upsert.mockResolvedValue({});

      const result = await service.markAsRead(AVISTAMIENTO_ID, USUARIO_ID);

      expect(result).toEqual({ ok: true });
      expect(mockPrisma.lecturaComentario.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            usuarioId_avistamientoId: { usuarioId: USUARIO_ID, avistamientoId: AVISTAMIENTO_ID },
          },
        }),
      );
    });

    it('lanza NotFoundException si el avistamiento no existe', async () => {
      mockPrisma.avistamiento.findUnique.mockResolvedValue(null);

      await expect(service.markAsRead('no-existe', USUARIO_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── getMyPetsThreads ───────────────────────────

  describe('getMyPetsThreads', () => {
    it('retorna mascotas con su avistamiento más reciente y noLeidos real', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          mascota_id: MASCOTA_ID,
          mascota_nombre: 'Max',
          mascota_estado: 'extraviada',
          mascota_foto_url: null,
          avistamiento_id: AVISTAMIENTO_ID,
          fecha_avistamiento: new Date(),
          total_hilos: BigInt(2),
          ultima_actividad: new Date(),
          ultimo_mensaje: 'Era un perro café',
          no_leidos: BigInt(1),
        },
      ]);

      const result = await service.getMyPetsThreads(USUARIO_ID);

      expect(result).toHaveLength(1);
      expect(result[0].mascota.nombre).toBe('Max');
      expect(result[0].avistamiento?.totalHilos).toBe(2);
      expect(result[0].avistamiento?.noLeidos).toBe(1);
    });

    it('retorna mascota con avistamiento null cuando no tiene conversaciones', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          mascota_id: MASCOTA_ID,
          mascota_nombre: 'Bobby',
          mascota_estado: 'extraviada',
          mascota_foto_url: null,
          avistamiento_id: null,
          fecha_avistamiento: null,
          total_hilos: null,
          ultima_actividad: null,
          ultimo_mensaje: null,
          no_leidos: null,
        },
      ]);

      const result = await service.getMyPetsThreads(USUARIO_ID);

      expect(result[0].avistamiento).toBeNull();
    });
  });

  // ───────────────────────── getMyParticipations ───────────────────────────

  describe('getMyParticipations', () => {
    it('retorna avistamientos donde el usuario comentó con noLeidos real', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          avistamiento_id: AVISTAMIENTO_ID,
          mascota_id: MASCOTA_ID,
          mascota_nombre: 'Max',
          mascota_estado: 'extraviada',
          mascota_foto_url: null,
          dueno_nombre: 'Wilian',
          dueno_foto_perfil_url: null,
          mi_ultimo_mensaje: 'La vi cerca del parque',
          ultima_respuesta: '¿A qué hora fue?',
          ultima_actividad: new Date(),
          no_leidos: BigInt(2),
        },
      ]);

      const result = await service.getMyParticipations(USUARIO_ID);

      expect(result).toHaveLength(1);
      expect(result[0].miUltimoMensaje).toBe('La vi cerca del parque');
      expect(result[0].noLeidos).toBe(2);
    });

    it('retorna array vacío cuando el usuario no participó en ningún avistamiento', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getMyParticipations(USUARIO_ID);

      expect(result).toHaveLength(0);
    });
  });

  // ───────────────────────── getUnreadCount ───────────────────────────

  describe('getUnreadCount', () => {
    it('retorna conteos reales de no leídos desde la BD', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(3) }])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getUnreadCount(USUARIO_ID);

      expect(result).toEqual({ total: 4, comoDueno: 3, comoRescatista: 1 });
    });

    it('retorna ceros si no hay mensajes no leídos', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(0) }])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      const result = await service.getUnreadCount(USUARIO_ID);

      expect(result).toEqual({ total: 0, comoDueno: 0, comoRescatista: 0 });
    });
  });
});
