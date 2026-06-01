import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { ChatsModule } from '../chats/chats.module';
import { SightingsService } from './sightings.service';
import { SightingsController } from './sightings.controller';

@Module({
  imports: [PrismaModule, CloudinaryModule, ChatsModule],
  controllers: [SightingsController],
  providers: [SightingsService],
})
export class SightingsModule {}
