import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AddOwnerDto } from './dto/add-owner.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PetsService } from './pets.service';

@ApiTags('Pets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar perfil de mascota con fotos opcionales (crea QR automáticamente)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['nombre'],
      properties: {
        nombre: { type: 'string', example: 'Firulais' },
        tipoId: { type: 'integer', example: 1 },
        sexo: { type: 'string', example: 'M' },
        colorPrimario: { type: 'string', example: 'Café' },
        rasgosParticulares: { type: 'string', example: 'Mancha blanca en la pata' },
        fotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: '0 a 4 fotos opcionales (jpeg, png, webp, gif — máx. 5 MB cada una)',
        },
        fotoPrincipalIndex: {
          type: 'integer',
          default: 0,
          description: 'Índice 0-based de la foto principal',
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('fotos', 4, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new BadRequestException('Solo se permiten imágenes'), false);
      },
    }),
  )
  create(
    @CurrentUser('personaId') personaId: string,
    @Body() dto: CreatePetDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.petsService.create(personaId, dto, files ?? [], dto.fotoPrincipalIndex ?? 0);
  }

  @Get()
  @ApiOperation({ summary: 'Listar mis mascotas' })
  findAll(@CurrentUser('personaId') personaId: string) {
    return this.petsService.findMyPets(personaId);
  }

  @Get('map')
  @ApiOperation({ summary: 'Ver mis mascotas en el mapa' })
  getPetsOnMap(@CurrentUser('personaId') personaId: string) {
    return this.petsService.findPetsOnMap(personaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una mascota' })
  findOne(@Param('id') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.petsService.findOne(mascotaId, personaId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar datos de mascota' })
  update(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: UpdatePetDto,
  ) {
    return this.petsService.update(mascotaId, personaId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar mascota' })
  remove(@Param('id') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.petsService.remove(mascotaId, personaId);
  }

  @Get(':id/qr')
  @ApiOperation({ summary: 'Obtener imagen QR de la placa (base64)' })
  getQr(@Param('id') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.petsService.getQr(mascotaId, personaId);
  }

  @Post(':id/owners')
  @ApiOperation({ summary: 'Agregar co-propietario o cuidador' })
  addOwner(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: AddOwnerDto,
  ) {
    return this.petsService.addOwner(mascotaId, personaId, dto);
  }

  @Delete(':id/owners/:personaId')
  @ApiOperation({ summary: 'Remover co-propietario o cuidador' })
  removeOwner(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Param('personaId') targetPersonaId: string,
  ) {
    return this.petsService.removeOwner(mascotaId, personaId, targetPersonaId);
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Reemplazar fotos de la mascota (mín. 1, máx. 4 imágenes)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fotos'],
      properties: {
        fotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: '1 a 4 imágenes (jpeg, png, webp, gif — máx. 5 MB cada una)',
        },
        fotoPrincipalIndex: {
          type: 'integer',
          default: 0,
          description: 'Índice 0-based de la foto principal',
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('fotos', 4, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new BadRequestException('Solo se permiten imágenes'), false);
      },
    }),
  )
  replacePhotos(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('fotoPrincipalIndex') principalIndexStr?: string,
  ) {
    const principalIndex = principalIndexStr !== undefined ? parseInt(principalIndexStr, 10) : 0;
    return this.petsService.uploadPhotos(mascotaId, personaId, files ?? [], principalIndex);
  }

  @Delete(':id/photos/:fotoId')
  @ApiOperation({ summary: 'Eliminar una foto de la mascota' })
  deletePhoto(
    @Param('id') mascotaId: string,
    @Param('fotoId', ParseIntPipe) fotoId: number,
    @CurrentUser('personaId') personaId: string,
  ) {
    return this.petsService.deletePhoto(mascotaId, personaId, fotoId);
  }
}
