import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddContactDto } from './dto/add-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { TipoContacto } from '@prisma/client';

const USUARIO_ID = 'usuario-uuid';
const PERSONA_ID = 'persona-uuid';

const mockUsersService = {
  findMe: jest.fn(),
  updateProfile: jest.fn(),
  updateProfilePhoto: jest.fn(),
  listContacts: jest.fn(),
  listEmergencyContacts: jest.fn(),
  addContact: jest.fn(),
  updateContact: jest.fn(),
  removeContact: jest.fn(),
  updateFcmToken: jest.fn(),
  updateLocation: jest.fn(),
  findUserCard: jest.fn(),
  findUsersOnMap: jest.fn(),
};

const mockJwtService = { verifyAsync: jest.fn() };

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getMe llama a usersService.findMe con el usuarioId del JWT', async () => {
    const mockPerfil = { usuarioId: USUARIO_ID };
    mockUsersService.findMe.mockResolvedValue(mockPerfil);

    const result = await controller.getMe(USUARIO_ID);

    expect(mockUsersService.findMe).toHaveBeenCalledWith(USUARIO_ID);
    expect(result).toEqual(mockPerfil);
  });

  it('updateMe llama a usersService.updateProfile', async () => {
    mockUsersService.updateProfile.mockResolvedValue({ nombre: 'Pedro' });
    const dto: UpdateProfileDto = { nombre: 'Pedro' };

    const result = await controller.updateMe(USUARIO_ID, dto);

    expect(mockUsersService.updateProfile).toHaveBeenCalledWith(USUARIO_ID, dto);
    expect(result).toEqual({ nombre: 'Pedro' });
  });

  it('addContact llama a usersService.addContact', async () => {
    const dto: AddContactDto = { tipo: TipoContacto.WhatsApp, valor: '+591' };
    mockUsersService.addContact.mockResolvedValue({ contactoId: 1 });

    await controller.addContact(USUARIO_ID, dto);

    expect(mockUsersService.addContact).toHaveBeenCalledWith(USUARIO_ID, dto);
  });

  it('removeContact llama a usersService.removeContact', async () => {
    mockUsersService.removeContact.mockResolvedValue({});

    await controller.removeContact(USUARIO_ID, 5);

    expect(mockUsersService.removeContact).toHaveBeenCalledWith(USUARIO_ID, 5);
  });

  it('updateLocation llama a usersService.updateLocation', async () => {
    const dto: UpdateLocationDto = { lat: -17.78, lng: -63.18 };
    mockUsersService.updateLocation.mockResolvedValue({ message: 'ok' });

    await controller.updateLocation(USUARIO_ID, dto);

    expect(mockUsersService.updateLocation).toHaveBeenCalledWith(USUARIO_ID, dto);
  });

  it('getUsersOnMap sin parámetros pasa opts vacío', async () => {
    mockUsersService.findUsersOnMap.mockResolvedValue([]);

    await controller.getUsersOnMap(undefined, undefined, undefined);

    expect(mockUsersService.findUsersOnMap).toHaveBeenCalledWith({
      lat: undefined,
      lng: undefined,
      radio: undefined,
    });
  });

  it('getUsersOnMap con parámetros convierte strings a números', async () => {
    mockUsersService.findUsersOnMap.mockResolvedValue([]);

    await controller.getUsersOnMap('-17.78', '-63.18', '1000');

    expect(mockUsersService.findUsersOnMap).toHaveBeenCalledWith({
      lat: -17.78,
      lng: -63.18,
      radio: 1000,
    });
  });

  // ───────────────────────── listContacts ──────────────────────

  it('listContacts delega a usersService.listContacts', async () => {
    const contactos = [{ contactoId: 1, tipo: 'WhatsApp', valor: '+591' }];
    mockUsersService.listContacts.mockResolvedValue(contactos);

    const result = await controller.listContacts(USUARIO_ID);

    expect(mockUsersService.listContacts).toHaveBeenCalledWith(USUARIO_ID);
    expect(result).toEqual(contactos);
  });

  // ─────────────────── listEmergencyContacts ───────────────────

  it('listEmergencyContacts delega a usersService.listEmergencyContacts', async () => {
    mockUsersService.listEmergencyContacts.mockResolvedValue([]);

    await controller.listEmergencyContacts(USUARIO_ID);

    expect(mockUsersService.listEmergencyContacts).toHaveBeenCalledWith(USUARIO_ID);
  });

  // ───────────────────────── updateContact ─────────────────────

  it('updateContact delega con usuarioId, contactoId numérico y dto', async () => {
    const dto: UpdateContactDto = { valor: '+591 71111111' };
    mockUsersService.updateContact.mockResolvedValue({ contactoId: 5 });

    await controller.updateContact(USUARIO_ID, 5, dto);

    expect(mockUsersService.updateContact).toHaveBeenCalledWith(USUARIO_ID, 5, dto);
  });

  // ───────────────────────── updatePhoto ───────────────────────

  it('updatePhoto delega a usersService.updateProfilePhoto con el archivo', async () => {
    const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as Express.Multer.File;
    mockUsersService.updateProfilePhoto.mockResolvedValue({
      fotoPerfilUrl: 'https://cdn.example.com/foto.jpg',
    });

    const result = await controller.updatePhoto(USUARIO_ID, file);

    expect(mockUsersService.updateProfilePhoto).toHaveBeenCalledWith(USUARIO_ID, file);
    expect(result.fotoPerfilUrl).toContain('cdn.example.com');
  });

  // ───────────────────────── updateFcmToken ────────────────────

  it('updateFcmToken delega a usersService.updateFcmToken', async () => {
    mockUsersService.updateFcmToken.mockResolvedValue({ message: 'Token FCM actualizado' });

    const result = await controller.updateFcmToken(USUARIO_ID, { tokenFcm: 'nuevo-token' });

    expect(mockUsersService.updateFcmToken).toHaveBeenCalledWith(USUARIO_ID, {
      tokenFcm: 'nuevo-token',
    });
    expect(result).toEqual({ message: 'Token FCM actualizado' });
  });

  // ───────────────────────── getUserCard ───────────────────────

  it('getUserCard delega a usersService.findUserCard con personaId', async () => {
    const card = { personaId: PERSONA_ID, nombreCompleto: 'Juan Pérez', mascotas: [] };
    mockUsersService.findUserCard.mockResolvedValue(card);

    const result = await controller.getUserCard(PERSONA_ID);

    expect(mockUsersService.findUserCard).toHaveBeenCalledWith(PERSONA_ID);
    expect(result).toEqual(card);
  });
});
