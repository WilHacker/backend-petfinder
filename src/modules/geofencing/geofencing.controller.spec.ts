import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GeofencingController } from './geofencing.controller';
import { GeofencingService } from './geofencing.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

const PERSONA_ID = 'persona-uuid';
const MASCOTA_ID = 'mascota-uuid';
const ZONA_ID = 1;

const mockGeofencingService = {
  createZone: jest.fn(),
  findZones: jest.fn(),
  findZone: jest.fn(),
  updateZone: jest.fn(),
  removeZone: jest.fn(),
};

const mockJwtService = { verifyAsync: jest.fn() };

describe('GeofencingController', () => {
  let controller: GeofencingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeofencingController],
      providers: [
        { provide: GeofencingService, useValue: mockGeofencingService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<GeofencingController>(GeofencingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createZone delega a geofencingService.createZone', async () => {
    const dto: CreateZoneDto = {
      nombreZona: 'Casa',
      tipo: 'circulo',
      lat: -17.78,
      lng: -63.18,
      radioMetros: 200,
    };
    mockGeofencingService.createZone.mockResolvedValue({ zona_id: ZONA_ID });

    await controller.createZone(MASCOTA_ID, PERSONA_ID, dto);

    expect(mockGeofencingService.createZone).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID, dto);
  });

  it('findZones delega a geofencingService.findZones', async () => {
    mockGeofencingService.findZones.mockResolvedValue([]);

    await controller.findZones(MASCOTA_ID, PERSONA_ID);

    expect(mockGeofencingService.findZones).toHaveBeenCalledWith(MASCOTA_ID, PERSONA_ID);
  });

  it('findZone delega a geofencingService.findZone con zonaId numérico', async () => {
    mockGeofencingService.findZone.mockResolvedValue({ zona_id: ZONA_ID });

    await controller.findZone(ZONA_ID, PERSONA_ID);

    expect(mockGeofencingService.findZone).toHaveBeenCalledWith(ZONA_ID, PERSONA_ID);
  });

  it('updateZone delega a geofencingService.updateZone', async () => {
    const dto: UpdateZoneDto = { nombreZona: 'Trabajo' };
    mockGeofencingService.updateZone.mockResolvedValue({ zona_id: ZONA_ID });

    await controller.updateZone(ZONA_ID, PERSONA_ID, dto);

    expect(mockGeofencingService.updateZone).toHaveBeenCalledWith(ZONA_ID, PERSONA_ID, dto);
  });

  it('removeZone delega a geofencingService.removeZone', async () => {
    mockGeofencingService.removeZone.mockResolvedValue({ message: 'Zona eliminada' });

    const result = await controller.removeZone(ZONA_ID, PERSONA_ID);

    expect(mockGeofencingService.removeZone).toHaveBeenCalledWith(ZONA_ID, PERSONA_ID);
    expect(result).toEqual({ message: 'Zona eliminada' });
  });
});
