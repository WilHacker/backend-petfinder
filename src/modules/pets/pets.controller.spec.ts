import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { AddOwnerDto } from './dto/add-owner.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

const PERSONA_ID = 'persona-uuid';
const MASCOTA_ID = 'mascota-uuid';
const FOTO_ID = 1;

const mockPetsService = {
  create: jest.fn(),
  findMyPets: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getQr: jest.fn(),
  addOwner: jest.fn(),
  removeOwner: jest.fn(),
  findPetsOnMap: jest.fn(),
  uploadPhotos: jest.fn(),
  deletePhoto: jest.fn(),
};

const mockJwtService = { verifyAsync: jest.fn() };

describe('PetsController', () => {
  let controller: PetsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetsController],
      providers: [
        { provide: PetsService, useValue: mockPetsService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<PetsController>(PetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create sin fotos delega con array vacío e índice 0 por defecto', async () => {
    const dto: CreatePetDto = { nombre: 'Firulais' };
    mockPetsService.create.mockResolvedValue({ mascotaId: MASCOTA_ID });

    await controller.create(PERSONA_ID, dto, undefined);

    expect(mockPetsService.create).toHaveBeenCalledWith(PERSONA_ID, dto, [], 0);
  });

  it('create con fotos pasa archivos e índice desde el DTO', async () => {
    const dto: CreatePetDto = { nombre: 'Firulais', fotoPrincipalIndex: 1 };
    const files = [{ buffer: Buffer.from('img'), mimetype: 'image/jpeg' }] as Express.Multer.File[];
    mockPetsService.create.mockResolvedValue({ mascotaId: MASCOTA_ID, fotos: [{}] });

    await controller.create(PERSONA_ID, dto, files);

    expect(mockPetsService.create).toHaveBeenCalledWith(PERSONA_ID, dto, files, 1);
  });

  it('findAll delega a petsService.findMyPets', async () => {
    mockPetsService.findMyPets.mockResolvedValue([]);

    await controller.findAll(PERSONA_ID);

    expect(mockPetsService.findMyPets).toHaveBeenCalledWith(PERSONA_ID);
  });

  it('getPetsOnMap delega a petsService.findPetsOnMap', async () => {
    mockPetsService.findPetsOnMap.mockResolvedValue([]);

    await controller.getPetsOnMap(PERSONA_ID);

    expect(mockPetsService.findPetsOnMap).toHaveBeenCalledWith(PERSONA_ID);
  });

  it('findOne delega a petsService.findOne con mascotaId y personaId', async () => {
    mockPetsService.findOne.mockResolvedValue({ mascotaId: MASCOTA_ID });

    await controller.findOne(MASCOTA_ID, PERSONA_ID);

    expect(mockPetsService.findOne).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
  });

  it('update delega a petsService.update', async () => {
    const dto: UpdatePetDto = { nombre: 'Toby' };
    mockPetsService.update.mockResolvedValue({ nombre: 'Toby' });

    await controller.update(MASCOTA_ID, PERSONA_ID, dto);

    expect(mockPetsService.update).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, dto);
  });

  it('remove delega a petsService.remove', async () => {
    mockPetsService.remove.mockResolvedValue({ message: 'Mascota eliminada' });

    await controller.remove(MASCOTA_ID, PERSONA_ID);

    expect(mockPetsService.remove).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
  });

  it('getQr delega a petsService.getQr y retorna base64', async () => {
    mockPetsService.getQr.mockResolvedValue('data:image/png;base64,abc');

    const result = await controller.getQr(MASCOTA_ID, PERSONA_ID);

    expect(mockPetsService.getQr).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
    expect(result).toBe('data:image/png;base64,abc');
  });

  it('addOwner delega a petsService.addOwner', async () => {
    const dto: AddOwnerDto = { personaId: 'otro-uuid' };
    mockPetsService.addOwner.mockResolvedValue({});

    await controller.addOwner(MASCOTA_ID, PERSONA_ID, dto);

    expect(mockPetsService.addOwner).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, dto);
  });

  it('removeOwner delega a petsService.removeOwner', async () => {
    mockPetsService.removeOwner.mockResolvedValue({});

    await controller.removeOwner(MASCOTA_ID, PERSONA_ID, 'otro-uuid');

    expect(mockPetsService.removeOwner).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, 'otro-uuid');
  });

  // ───────────────────────── Fotos ─────────────────────────────

  describe('replacePhotos', () => {
    const makeFile = (): Express.Multer.File =>
      ({
        buffer: Buffer.from('img'),
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        size: 500,
        fieldname: 'fotos',
        encoding: '7bit',
        stream: null as never,
        destination: '',
        filename: '',
        path: '',
      }) satisfies Express.Multer.File;

    it('delega a uploadPhotos con índice 0 por defecto', async () => {
      const files = [makeFile()];
      mockPetsService.uploadPhotos.mockResolvedValue([{ fotoId: 1 }]);

      await controller.replacePhotos(MASCOTA_ID, PERSONA_ID, files, undefined);

      expect(mockPetsService.uploadPhotos).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, files, 0);
    });

    it('convierte fotoPrincipalIndex de string a número', async () => {
      const files = [makeFile(), makeFile()];
      mockPetsService.uploadPhotos.mockResolvedValue([{}, {}]);

      await controller.replacePhotos(MASCOTA_ID, PERSONA_ID, files, '1');

      expect(mockPetsService.uploadPhotos).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, files, 1);
    });

    it('pasa array vacío si files es undefined', async () => {
      mockPetsService.uploadPhotos.mockResolvedValue([]);

      await controller.replacePhotos(MASCOTA_ID, PERSONA_ID, undefined as never, undefined);

      expect(mockPetsService.uploadPhotos).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, [], 0);
    });
  });

  describe('deletePhoto', () => {
    it('delega a petsService.deletePhoto con fotoId numérico', async () => {
      mockPetsService.deletePhoto.mockResolvedValue({ message: 'Foto eliminada' });

      const result = await controller.deletePhoto(MASCOTA_ID, FOTO_ID, PERSONA_ID);

      expect(mockPetsService.deletePhoto).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, FOTO_ID);
      expect(result).toEqual({ message: 'Foto eliminada' });
    });
  });
});
