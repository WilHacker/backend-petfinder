import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PetsModule } from './modules/pets/pets.module';
import { GeofencingModule } from './modules/geofencing/geofencing.module';
import { TiposMascotaModule } from './modules/tipos-mascota/tipos-mascota.module';
import { MapModule } from './modules/map/map.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN', '24h'),
        },
      }),
      inject: [ConfigService],
    }),
    // Rate limiting global: 120 req/min por IP
    // Auth endpoints usan @Throttle override: 10 req/min
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    RealtimeModule,
    CloudinaryModule,
    AuthModule,
    UsersModule,
    PetsModule,
    GeofencingModule,
    TiposMascotaModule,
    MapModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard aplicado globalmente a todos los endpoints HTTP
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
