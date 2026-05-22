import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TipoContacto } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

const mockUsuario = {
  usuarioId: 'usuario-uuid',
  personaId: 'persona-uuid',
  correoElectronico: 'juan@test.com',
  estadoCuenta: 'activa',
};

const mockPersona = {
  personaId: 'persona-uuid',
  nombre: 'Juan',
  apellidoPaterno: 'Pérez',
  apellidoMaterno: null,
  ci: null,
  fotoPerfilUrl: null,
  fechaNacimiento: null,
  mediosContacto: [],
};

const mockCloudinary = {
  uploadBuffer: jest.fn(),
  deleteByUrl: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  usuario: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  persona: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  medioContacto: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  propietarioMascota: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $executeRaw: jest.fn().mockResolvedValue(1),
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const mockRealtime = {
  emitOwnerLocationUpdated: jest.fn(),
  emitPetLocationUpdated: jest.fn(),
  emitPetEnteredZone: jest.fn(),
  emitPetExitedZone: jest.fn(),
  emitOwnerProfileUpdated: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Restaurar el valor por defecto del $queryRaw (retorna array vacío)
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: CloudinaryService, useValue: mockCloudinary },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── findMe ────────────────────────────

  describe('findMe', () => {
    it('retorna perfil del usuario con ubicación cuando existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        persona: mockPersona,
      });
      mockPrisma.$queryRaw.mockResolvedValue([{ lat: -17.78, lng: -63.18 }]);

      const result = await service.findMe('usuario-uuid');

      expect(result.usuarioId).toBe('usuario-uuid');
      expect(result.ubicacion).toEqual({ lat: -17.78, lng: -63.18 });
    });

    it('retorna ubicacion null cuando no hay coordenadas', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        persona: mockPersona,
      });
      mockPrisma.$queryRaw.mockResolvedValue([{ lat: null, lng: null }]);

      const result = await service.findMe('usuario-uuid');

      expect(result.ubicacion).toBeNull();
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.findMe('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── updateProfile ─────────────────────

  describe('updateProfile', () => {
    it('actualiza los datos biográficos de la persona', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.persona.update.mockResolvedValue({ ...mockPersona, nombre: 'Pedro' });

      const result = await service.updateProfile('usuario-uuid', { nombre: 'Pedro' });

      expect(result.nombre).toBe('Pedro');
      expect(mockPrisma.persona.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personaId: 'persona-uuid' } }),
      );
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.updateProfile('no-existe', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── addContact ────────────────────────

  describe('addContact', () => {
    it('crea un nuevo medio de contacto', async () => {
      const mockContacto = {
        contactoId: 1,
        personaId: 'persona-uuid',
        tipo: 'WhatsApp',
        valor: '+591 70000000',
      };
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.create.mockResolvedValue(mockContacto);

      const result = await service.addContact('usuario-uuid', {
        tipo: 'WhatsApp',
        valor: '+591 70000000',
      });

      expect(result.valor).toBe('+591 70000000');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.addContact('no-existe', { tipo: TipoContacto.Celular, valor: '70000000' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── removeContact ─────────────────────

  describe('removeContact', () => {
    const mockContacto = {
      contactoId: 1,
      personaId: 'persona-uuid',
      tipo: 'WhatsApp',
      valor: '+591',
    };

    it('elimina el contacto cuando es del mismo dueño', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findUnique.mockResolvedValue(mockContacto);
      mockPrisma.medioContacto.delete.mockResolvedValue(mockContacto);

      const result = await service.removeContact('usuario-uuid', 1);

      expect(mockPrisma.medioContacto.delete).toHaveBeenCalledWith({ where: { contactoId: 1 } });
      expect(result).toEqual(mockContacto);
    });

    it('lanza NotFoundException si el contacto no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findUnique.mockResolvedValue(null);

      await expect(service.removeContact('usuario-uuid', 99)).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el contacto pertenece a otro usuario', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findUnique.mockResolvedValue({
        ...mockContacto,
        personaId: 'otra-persona-uuid',
      });

      await expect(service.removeContact('usuario-uuid', 1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────── updateLocation ────────────────────

  describe('updateLocation', () => {
    beforeEach(() => {
      // $queryRaw se usa para: UPDATE mascotas RETURNING (→ []) y checkAndUpdateZones (→ [])
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // usuario.findUnique devuelve personaId para el emit de owner location
      mockPrisma.usuario.findUnique.mockResolvedValue({ personaId: 'persona-uuid' });
      // propietarioMascota.findMany devuelve todas las mascotas del usuario (para petRooms)
      mockPrisma.propietarioMascota.findMany.mockResolvedValue([]);
    });

    it('ejecuta UPDATE usuario e INSERT historial ($executeRaw x2)', async () => {
      await service.updateLocation('usuario-uuid', { lat: -17.78, lng: -63.18 });

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('retorna mensaje de confirmación', async () => {
      const result = await service.updateLocation('usuario-uuid', { lat: -17.78, lng: -63.18 });

      expect(result).toEqual({ message: 'Ubicación actualizada' });
    });

    it('emite owner:location-updated a los rooms de mascotas del usuario', async () => {
      mockPrisma.propietarioMascota.findMany.mockResolvedValue([
        { mascotaId: 'mascota-uuid-1' },
        { mascotaId: 'mascota-uuid-2' },
      ]);

      await service.updateLocation('usuario-uuid', { lat: -17.78, lng: -63.18 });

      expect(mockRealtime.emitOwnerLocationUpdated).toHaveBeenCalledWith(
        ['pet:mascota-uuid-1', 'pet:mascota-uuid-2'],
        expect.objectContaining({ lat: -17.78, lng: -63.18 }),
      );
    });

    it('emite pet:location-updated y hace check de zonas por cada mascota en paseo', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          { mascota_id: 'mascota-en-paseo', nombre: 'Rex', estado: 'en_paseo' },
        ]) // UPDATE mascotas RETURNING
        .mockResolvedValueOnce([]); // checkAndUpdateZones SELECT zonas

      await service.updateLocation('usuario-uuid', { lat: -17.78, lng: -63.18 });

      expect(mockRealtime.emitPetLocationUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ mascotaId: 'mascota-en-paseo' }),
      );
    });
  });

  // ───────────────────────── findUsersOnMap ────────────────────

  describe('findUsersOnMap', () => {
    const mockRows = [
      { usuario_id: 'uuid', nombre: 'Juan', apellido_paterno: 'Pérez', lat: -17.78, lng: -63.18 },
    ];

    it('retorna todos los usuarios activos cuando no se pasan coordenadas', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockRows);

      const result = await service.findUsersOnMap();

      expect(result).toEqual(mockRows);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('usa ST_DWithin cuando se pasan lat/lng', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockRows);

      const result = await service.findUsersOnMap({ lat: -17.78, lng: -63.18, radio: 1000 });

      expect(result).toEqual(mockRows);
    });
  });

  // ───────────────────────── listContacts ──────────────────────

  describe('listContacts', () => {
    it('retorna todos los contactos del usuario ordenados', async () => {
      const contactos = [
        {
          contactoId: 1,
          tipo: 'WhatsApp',
          valor: '+591 70000000',
          esPrincipal: true,
          esEmergencia: false,
        },
        {
          contactoId: 2,
          tipo: 'Email',
          valor: 'juan@test.com',
          esPrincipal: false,
          esEmergencia: false,
        },
      ];
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findMany.mockResolvedValue(contactos);

      const result = await service.listContacts('usuario-uuid');

      expect(result).toEqual(contactos);
      expect(mockPrisma.medioContacto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personaId: 'persona-uuid' } }),
      );
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.listContacts('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── updateContact ─────────────────────

  describe('updateContact', () => {
    const mockContacto = {
      contactoId: 1,
      personaId: 'persona-uuid',
      tipo: 'WhatsApp',
      valor: '+591 70000000',
    };

    it('actualiza el contacto correctamente', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findUnique.mockResolvedValue(mockContacto);
      mockPrisma.medioContacto.update.mockResolvedValue({
        ...mockContacto,
        valor: '+591 71111111',
      });

      const result = await service.updateContact('usuario-uuid', 1, { valor: '+591 71111111' });

      expect(result.valor).toBe('+591 71111111');
      expect(mockPrisma.medioContacto.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contactoId: 1 } }),
      );
    });

    it('lanza ForbiddenException si el contacto pertenece a otro usuario', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findUnique.mockResolvedValue({
        ...mockContacto,
        personaId: 'otra-persona-uuid',
      });

      await expect(service.updateContact('usuario-uuid', 1, { valor: '+0' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza NotFoundException si el contacto no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findUnique.mockResolvedValue(null);

      await expect(service.updateContact('usuario-uuid', 99, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────── listEmergencyContacts ───────────────────

  describe('listEmergencyContacts', () => {
    it('retorna solo los contactos marcados como emergencia', async () => {
      const emergencia = [
        { contactoId: 2, tipo: 'Celular', valor: '+591 79999999', esEmergencia: true },
      ];
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.medioContacto.findMany.mockResolvedValue(emergencia);

      const result = await service.listEmergencyContacts('usuario-uuid');

      expect(result).toEqual(emergencia);
      expect(mockPrisma.medioContacto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personaId: 'persona-uuid', esEmergencia: true },
        }),
      );
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.listEmergencyContacts('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── updateFcmToken ────────────────────

  describe('updateFcmToken', () => {
    it('actualiza el tokenFcm del usuario', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrisma.usuario.update.mockResolvedValue({});

      const result = await service.updateFcmToken('usuario-uuid', { tokenFcm: 'nuevo-token' });

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { usuarioId: 'usuario-uuid' },
          data: { tokenFcm: 'nuevo-token' },
        }),
      );
      expect(result).toEqual({ message: 'Token FCM actualizado' });
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.updateFcmToken('no-existe', { tokenFcm: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ───────────────────────── findUserCard ──────────────────────

  describe('findUserCard', () => {
    const mockPersonaCard = {
      personaId: 'persona-uuid',
      nombre: 'Juan',
      apellidoPaterno: 'Pérez',
      apellidoMaterno: null,
      fotoPerfilUrl: null,
      mediosContacto: [{ tipo: 'WhatsApp', valor: '+591 70000000' }],
      mascotasPropietario: [
        {
          mascota: {
            mascotaId: 'mascota-uuid',
            nombre: 'Rex',
            tipoMascota: { nombre: 'Perro' },
            fotos: [{ fotoUrl: 'https://cdn.example.com/rex.jpg' }],
          },
        },
      ],
    };

    it('retorna la tarjeta del usuario con mascotas y contactos', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(mockPersonaCard);

      const result = await service.findUserCard('persona-uuid');

      expect(result.personaId).toBe('persona-uuid');
      expect(result.nombreCompleto).toBe('Juan Pérez');
      expect(result.contactos).toHaveLength(1);
      expect(result.mascotas).toHaveLength(1);
      expect(result.mascotas[0].nombre).toBe('Rex');
    });

    it('lanza NotFoundException si la persona no existe', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(null);

      await expect(service.findUserCard('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────── updateProfilePhoto ──────────────────

  describe('updateProfilePhoto', () => {
    const fakeFile: Express.Multer.File = {
      buffer: Buffer.from('img'),
      mimetype: 'image/jpeg',
      originalname: 'foto.jpg',
      size: 500,
      fieldname: 'foto',
      encoding: '7bit',
      stream: null as never,
      destination: '',
      filename: '',
      path: '',
    };

    it('sube la nueva foto y actualiza fotoPerfilUrl', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        persona: { fotoPerfilUrl: null },
      });
      mockCloudinary.uploadBuffer.mockResolvedValue({
        secure_url: 'https://cdn.cloudinary.com/personas/persona-uuid/foto.jpg',
      });
      mockPrisma.persona.update.mockResolvedValue({
        personaId: 'persona-uuid',
        fotoPerfilUrl: 'https://cdn.cloudinary.com/personas/persona-uuid/foto.jpg',
      });

      const result = await service.updateProfilePhoto('usuario-uuid', fakeFile);

      expect(mockCloudinary.uploadBuffer).toHaveBeenCalledWith(
        fakeFile.buffer,
        'personas/persona-uuid',
      );
      expect(result.fotoPerfilUrl).toContain('cloudinary.com');
    });

    it('elimina la foto anterior antes de subir la nueva', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        persona: { fotoPerfilUrl: 'https://cdn.cloudinary.com/old.jpg' },
      });
      mockCloudinary.uploadBuffer.mockResolvedValue({
        secure_url: 'https://cdn.cloudinary.com/new.jpg',
      });
      mockPrisma.persona.update.mockResolvedValue({
        personaId: 'persona-uuid',
        fotoPerfilUrl: 'https://cdn.cloudinary.com/new.jpg',
      });

      await service.updateProfilePhoto('usuario-uuid', fakeFile);

      expect(mockCloudinary.deleteByUrl).toHaveBeenCalledWith('https://cdn.cloudinary.com/old.jpg');
    });

    it('emite owner:profile-updated a los rooms de mascotas del usuario', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        persona: { fotoPerfilUrl: null },
      });
      mockCloudinary.uploadBuffer.mockResolvedValue({
        secure_url: 'https://cdn.cloudinary.com/new.jpg',
      });
      mockPrisma.persona.update.mockResolvedValue({
        personaId: 'persona-uuid',
        fotoPerfilUrl: 'https://cdn.cloudinary.com/new.jpg',
      });
      mockPrisma.propietarioMascota.findMany.mockResolvedValue([
        { mascotaId: 'mascota-uuid-1' },
        { mascotaId: 'mascota-uuid-2' },
      ]);

      await service.updateProfilePhoto('usuario-uuid', fakeFile);

      expect(mockRealtime.emitOwnerProfileUpdated).toHaveBeenCalledWith(
        ['pet:mascota-uuid-1', 'pet:mascota-uuid-2'],
        expect.objectContaining({
          personaId: 'persona-uuid',
          fotoPerfilUrl: 'https://cdn.cloudinary.com/new.jpg',
        }),
      );
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.updateProfilePhoto('no-existe', fakeFile)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
