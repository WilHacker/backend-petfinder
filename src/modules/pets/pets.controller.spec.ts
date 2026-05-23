import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { AddOwnerDto } from './dto/add-owner.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';

const PERSONA_ID = 'persona-uuid';
const MASCOTA_ID = 'mascota-uuid';
const FOTO_ID = 1;
const TOKEN_ACCESO = 'token-uuid';
const REGISTRO_ID = 1;

const mockPetsService = {
  create: jest.fn(),
  findMyPets: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getQr: jest.fn(),
  addOwner: jest.fn(),
  removeOwner: jest.fn(),
  updateStatus: jest.fn(),
  findPetsOnMap: jest.fn(),
  uploadPhotos: jest.fn(),
  deletePhoto: jest.fn(),
  findPetCard: jest.fn(),
  getPetByToken: jest.fn(),
  registerScan: jest.fn(),
  getScans: jest.fn(),
  getReports: jest.fn(),
  getMedicalRecords: jest.fn(),
  addMedicalRecord: jest.fn(),
  updateMedicalRecord: jest.fn(),
  removeMedicalRecord: jest.fn(),
  sendCommunityAlert: jest.fn(),
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

  it('getQr delega a petsService.getQr y retorna base64 (format=png por defecto)', async () => {
    mockPetsService.getQr.mockResolvedValue('data:image/png;base64,abc');

    const result = await controller.getQr(MASCOTA_ID, PERSONA_ID, undefined, undefined, undefined);

    expect(mockPetsService.getQr).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, undefined, 'png');
    expect(result).toBe('data:image/png;base64,abc');
  });

  it('addOwner delega a petsService.addOwner', async () => {
    const dto: AddOwnerDto = { correoElectronico: 'otro@example.com' };
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

  describe('addPhotos', () => {
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

    it('delega a uploadPhotos con principalIndex undefined cuando no se envía', async () => {
      const files = [makeFile()];
      mockPetsService.uploadPhotos.mockResolvedValue([{ fotoId: 1 }]);

      await controller.addPhotos(MASCOTA_ID, PERSONA_ID, files, undefined);

      expect(mockPetsService.uploadPhotos).toHaveBeenCalledWith(
        MASCOTA_ID,
        PERSONA_ID,
        files,
        undefined,
      );
    });

    it('convierte fotoPrincipalIndex de string a número', async () => {
      const files = [makeFile(), makeFile()];
      mockPetsService.uploadPhotos.mockResolvedValue([{}, {}]);

      await controller.addPhotos(MASCOTA_ID, PERSONA_ID, files, '1');

      expect(mockPetsService.uploadPhotos).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, files, 1);
    });

    it('pasa array vacío si files es undefined', async () => {
      mockPetsService.uploadPhotos.mockResolvedValue([]);

      await controller.addPhotos(MASCOTA_ID, PERSONA_ID, undefined as never, undefined);

      expect(mockPetsService.uploadPhotos).toHaveBeenCalledWith(
        MASCOTA_ID,
        PERSONA_ID,
        [],
        undefined,
      );
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

  // ───────────────────────── updateStatus ──────────────────────

  describe('updateStatus', () => {
    it('delega a petsService.updateStatus con mascotaId, personaId y estado', async () => {
      mockPetsService.updateStatus.mockResolvedValue({
        mascotaId: MASCOTA_ID,
        estado: 'extraviada',
      });

      const result = await controller.updateStatus(MASCOTA_ID, PERSONA_ID, {
        estado: 'extraviada',
      });

      expect(mockPetsService.updateStatus).toHaveBeenCalledWith(
        MASCOTA_ID,
        PERSONA_ID,
        'extraviada',
      );
      expect(result.estado).toBe('extraviada');
    });
  });

  // ───────────────────────── getPetCard ────────────────────────

  describe('getPetCard', () => {
    it('delega a petsService.findPetCard con mascotaId', async () => {
      const card = { mascotaId: MASCOTA_ID, nombre: 'Firulais', propietarios: [] };
      mockPetsService.findPetCard.mockResolvedValue(card);

      const result = await controller.getPetCard(MASCOTA_ID);

      expect(mockPetsService.findPetCard).toHaveBeenCalledWith(MASCOTA_ID);
      expect(result).toEqual(card);
    });
  });

  // ───────────────────────── getPetByToken ─────────────────────

  describe('getPetByToken', () => {
    it('delega a petsService.getPetByToken con el token', async () => {
      const card = { mascotaId: MASCOTA_ID, nombre: 'Firulais' };
      mockPetsService.getPetByToken.mockResolvedValue(card);

      const result = await controller.getPetByToken(TOKEN_ACCESO);

      expect(mockPetsService.getPetByToken).toHaveBeenCalledWith(TOKEN_ACCESO);
      expect(result).toEqual(card);
    });
  });

  // ───────────────────────── registerScan ──────────────────────

  describe('registerScan', () => {
    it('delega a petsService.registerScan con token y dto', async () => {
      const escaneo = { escaneoId: 'scan-uuid', mascotaId: MASCOTA_ID };
      mockPetsService.registerScan.mockResolvedValue(escaneo);

      const result = await controller.registerScan(TOKEN_ACCESO, { lat: -17.78, lng: -63.18 });

      expect(mockPetsService.registerScan).toHaveBeenCalledWith(TOKEN_ACCESO, {
        lat: -17.78,
        lng: -63.18,
      });
      expect(result).toEqual(escaneo);
    });
  });

  // ───────────────────────── getScans ──────────────────────────

  describe('getScans', () => {
    it('delega a petsService.getScans con mascotaId y personaId', async () => {
      mockPetsService.getScans.mockResolvedValue([{ escaneoId: 'scan-1' }]);

      const result = await controller.getScans(MASCOTA_ID, PERSONA_ID);

      expect(mockPetsService.getScans).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
      expect(result).toHaveLength(1);
    });
  });

  // ───────────────────────── getReports ────────────────────────

  describe('getReports', () => {
    it('delega a petsService.getReports con mascotaId y personaId', async () => {
      mockPetsService.getReports.mockResolvedValue([{ reporte_id: 1 }]);

      const result = await controller.getReports(MASCOTA_ID, PERSONA_ID);

      expect(mockPetsService.getReports).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
      expect(result).toHaveLength(1);
    });
  });

  // ─────────────────────── getMedicalRecords ───────────────────

  describe('getMedicalRecords', () => {
    it('delega a petsService.getMedicalRecords', async () => {
      mockPetsService.getMedicalRecords.mockResolvedValue([{ registroId: 1, tipo: 'Vacuna' }]);

      const result = await controller.getMedicalRecords(MASCOTA_ID, PERSONA_ID);

      expect(mockPetsService.getMedicalRecords).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
      expect(result).toHaveLength(1);
    });
  });

  // ─────────────────────── addMedicalRecord ────────────────────

  describe('addMedicalRecord', () => {
    it('delega a petsService.addMedicalRecord con dto', async () => {
      const dto: CreateMedicalRecordDto = { tipo: 'Vacuna', descripcion: 'Antirrábica' };
      mockPetsService.addMedicalRecord.mockResolvedValue({ registroId: 1 });

      await controller.addMedicalRecord(MASCOTA_ID, PERSONA_ID, dto);

      expect(mockPetsService.addMedicalRecord).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, dto);
    });
  });

  // ─────────────────────── updateMedicalRecord ─────────────────

  describe('updateMedicalRecord', () => {
    it('delega a petsService.updateMedicalRecord con registroId numérico', async () => {
      const dto: UpdateMedicalRecordDto = { descripcion: 'Actualizada' };
      mockPetsService.updateMedicalRecord.mockResolvedValue({ registroId: REGISTRO_ID });

      await controller.updateMedicalRecord(MASCOTA_ID, REGISTRO_ID, PERSONA_ID, dto);

      expect(mockPetsService.updateMedicalRecord).toHaveBeenCalledWith(
        MASCOTA_ID,
        PERSONA_ID,
        REGISTRO_ID,
        dto,
      );
    });
  });

  // ─────────────────────── removeMedicalRecord ─────────────────

  describe('removeMedicalRecord', () => {
    it('delega a petsService.removeMedicalRecord y retorna mensaje', async () => {
      mockPetsService.removeMedicalRecord.mockResolvedValue({ message: 'Registro eliminado' });

      const result = await controller.removeMedicalRecord(MASCOTA_ID, REGISTRO_ID, PERSONA_ID);

      expect(mockPetsService.removeMedicalRecord).toHaveBeenCalledWith(
        MASCOTA_ID,
        PERSONA_ID,
        REGISTRO_ID,
      );
      expect(result).toEqual({ message: 'Registro eliminado' });
    });
  });
});
