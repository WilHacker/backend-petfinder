import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddContactDto } from './dto/add-contact.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { TipoContacto } from '@prisma/client';

const USUARIO_ID = 'usuario-uuid';

const mockUsersService = {
  findMe: jest.fn(),
  updateProfile: jest.fn(),
  addContact: jest.fn(),
  removeContact: jest.fn(),
  updateLocation: jest.fn(),
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
});
