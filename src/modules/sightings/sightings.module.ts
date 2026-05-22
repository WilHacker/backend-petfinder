import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { SightingsService } from './sightings.service';
import { SightingsController } from './sightings.controller';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [SightingsController],
  providers: [SightingsService],
})
export class SightingsModule {}
