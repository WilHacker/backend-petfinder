import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddContactDto } from './dto/add-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil propio' })
  getMe(@CurrentUser('sub') usuarioId: string) {
    return this.usersService.findMe(usuarioId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Actualizar datos biográficos' })
  updateMe(@CurrentUser('sub') usuarioId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(usuarioId, dto);
  }

  @Put('me/photo')
  @ApiOperation({ summary: 'Actualizar foto de perfil' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['foto'],
      properties: {
        foto: {
          type: 'string',
          format: 'binary',
          description: 'Imagen (jpeg, png, webp — máx. 5 MB)',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new BadRequestException('Solo se permiten imágenes'), false);
      },
    }),
  )
  updatePhoto(@CurrentUser('sub') usuarioId: string, @UploadedFile() file: Express.Multer.File) {
    return this.usersService.updateProfilePhoto(usuarioId, file);
  }

  @Get('me/contacts')
  @ApiOperation({ summary: 'Listar todos los medios de contacto del usuario' })
  listContacts(@CurrentUser('sub') usuarioId: string) {
    return this.usersService.listContacts(usuarioId);
  }

  @Get('me/contacts/emergency')
  @ApiOperation({
    summary: 'Listar contactos de emergencia',
    description: 'Solo devuelve los contactos marcados con esEmergencia=true.',
  })
  listEmergencyContacts(@CurrentUser('sub') usuarioId: string) {
    return this.usersService.listEmergencyContacts(usuarioId);
  }

  @Post('me/contacts')
  @ApiOperation({ summary: 'Agregar medio de contacto' })
  addContact(@CurrentUser('sub') usuarioId: string, @Body() dto: AddContactDto) {
    return this.usersService.addContact(usuarioId, dto);
  }

  @Put('me/contacts/:id')
  @ApiOperation({
    summary: 'Actualizar un medio de contacto',
    description: 'Permite cambiar el valor, marcarlo como principal o de emergencia.',
  })
  updateContact(
    @CurrentUser('sub') usuarioId: string,
    @Param('id', ParseIntPipe) contactoId: number,
    @Body() dto: UpdateContactDto,
  ) {
    return this.usersService.updateContact(usuarioId, contactoId, dto);
  }

  @Delete('me/contacts/:id')
  @ApiOperation({ summary: 'Eliminar medio de contacto' })
  removeContact(
    @CurrentUser('sub') usuarioId: string,
    @Param('id', ParseIntPipe) contactoId: number,
  ) {
    return this.usersService.removeContact(usuarioId, contactoId);
  }

  @Put('me/fcm-token')
  @ApiOperation({
    summary: 'Registrar o actualizar token FCM del dispositivo',
    description:
      'Android llama a este endpoint tras obtener el token de Firebase Messaging. ' +
      'Sin un token registrado las notificaciones push (mascota extraviada, escaneo QR, etc.) no llegan.',
  })
  updateFcmToken(@CurrentUser('sub') usuarioId: string, @Body() dto: UpdateFcmTokenDto) {
    return this.usersService.updateFcmToken(usuarioId, dto);
  }

  @Put('me/location')
  @ApiOperation({ summary: 'Actualizar ubicación GPS del usuario' })
  updateLocation(@CurrentUser('sub') usuarioId: string, @Body() dto: UpdateLocationDto) {
    return this.usersService.updateLocation(usuarioId, dto);
  }

  @Get(':personaId/card')
  @ApiOperation({
    summary: 'Tarjeta de perfil de un usuario (popup del mapa)',
    description:
      'Devuelve nombre, foto, medios de contacto y lista de mascotas del usuario indicado. ' +
      'Accesible para cualquier usuario autenticado.',
  })
  getUserCard(@Param('personaId') personaId: string) {
    return this.usersService.findUserCard(personaId);
  }

  @Get('map')
  @ApiOperation({
    summary:
      'Listar dueños visibles en el mapa (lat/lng/radio opcionales para filtrar por proximidad)',
  })
  getUsersOnMap(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radio') radio?: string,
  ) {
    return this.usersService.findUsersOnMap({
      lat: lat !== undefined ? Number(lat) : undefined,
      lng: lng !== undefined ? Number(lng) : undefined,
      radio: radio !== undefined ? Number(radio) : undefined,
    });
  }
}
