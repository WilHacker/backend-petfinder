import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PetsModule } from './modules/pets/pets.module';
import { GeofencingModule } from './modules/geofencing/geofencing.module';

@Module({
  imports: [AuthModule, UsersModule, PetsModule, GeofencingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
