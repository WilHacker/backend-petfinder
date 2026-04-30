import { Test, TestingModule } from '@nestjs/testing';
import { GeofencingService } from './geofencing.service';

describe('GeofencingService', () => {
  let service: GeofencingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeofencingService],
    }).compile();

    service = module.get<GeofencingService>(GeofencingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
