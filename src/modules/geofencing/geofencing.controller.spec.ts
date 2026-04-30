import { Test, TestingModule } from '@nestjs/testing';
import { GeofencingController } from './geofencing.controller';

describe('GeofencingController', () => {
  let controller: GeofencingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeofencingController],
    }).compile();

    controller = module.get<GeofencingController>(GeofencingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
