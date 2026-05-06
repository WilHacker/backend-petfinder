import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PetsModule } from './modules/pets/pets.module';
import { GeofencingModule } from './modules/geofencing/geofencing.module';

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
    CloudinaryModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    PetsModule,
    GeofencingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
