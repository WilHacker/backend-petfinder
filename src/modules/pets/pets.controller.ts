import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ScanDto } from './dto/scan.dto';
import { AddOwnerDto } from './dto/add-owner.dto';
import { CommunityAlertDto } from './dto/community-alert.dto';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { UpdatePetLocationDto } from './dto/update-pet-location.dto';
import { UpdatePetStatusDto } from './dto/update-pet-status.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
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
  @ApiOperation({
    summary: 'Ver mis mascotas en el mapa (#31)',
    description:
      'Devuelve TODAS las mascotas del dueño autenticado. ' +
      'Las que aún no tienen GPS vienen con lat/lng null — el frontend las muestra sin marcador de posición.',
  })
  getPetsOnMap(@CurrentUser('personaId') personaId: string) {
    return this.petsService.findPetsOnMap(personaId);
  }

  @Get(':id/owners-map')
  @ApiOperation({
    summary: 'Ver propietarios de una mascota en el mapa (#32)',
    description:
      'Devuelve todos los dueños y cuidadores de la mascota con su última ubicación GPS conocida. ' +
      'Los que no han compartido ubicación vienen con lat/lng null.',
  })
  getPetOwnersOnMap(@Param('id') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.petsService.findPetOwnersOnMap(mascotaId, personaId);
  }

  @Put(':id/report/reward')
  @ApiOperation({
    summary: 'Establecer o actualizar la recompensa del reporte activo',
    description:
      'Solo disponible cuando la mascota está extraviada (tiene un reporte abierto). ' +
      'Enviar `recompensa: 0` para indicar que no se ofrece recompensa económica.',
  })
  updateReward(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: UpdateRewardDto,
  ) {
    return this.petsService.updateReward(mascotaId, personaId, dto.recompensa);
  }

  @Put(':id/location')
  @ApiOperation({
    summary: 'Actualizar ubicación manual de la mascota',
    description:
      'Fija las coordenadas de la mascota sin necesidad de un paseo activo. ' +
      'Útil para establecer la ubicación inicial al registrarla o al recibir un avistamiento. ' +
      'Emite evento WebSocket pet:location-updated a todos los co-propietarios.',
  })
  updateLocation(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: UpdatePetLocationDto,
  ) {
    return this.petsService.updatePetLocation(mascotaId, personaId, dto.lat, dto.lng);
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Cambiar el estado de la mascota',
    description:
      'Valores: en_casa | en_paseo | extraviada | recuperada. ' +
      'Cuando el estado cambia a en_paseo, las siguientes actualizaciones de ' +
      'ubicación del dueño propagan automáticamente las coordenadas a la mascota. ' +
      'Emite evento WebSocket pet:status-changed a todos los co-propietarios.',
  })
  updateStatus(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: UpdatePetStatusDto,
  ) {
    return this.petsService.updateStatus(mascotaId, personaId, dto.estado);
  }

  @Get(':id/card')
  @Public()
  @ApiOperation({
    summary: 'Tarjeta de detalle de una mascota (popup del mapa / escaneo QR)',
    description:
      'Devuelve el perfil completo de la mascota con todas sus fotos y la lista de ' +
      'propietarios con sus medios de contacto. Acceso público — no requiere token.',
  })
  getPetCard(@Param('id') mascotaId: string) {
    return this.petsService.findPetCard(mascotaId);
  }

  @Get('public/:token')
  @Public()
  @ApiOperation({
    summary: 'Datos públicos de la mascota por token QR',
    description:
      'Recibe el tokenAcceso de la placa QR y retorna la tarjeta pública de la mascota. ' +
      'Llamar cuando la página web carga tras escanear el QR. Sin JWT requerido.',
  })
  getPetByToken(@Param('token', ParseUUIDPipe) tokenAcceso: string) {
    return this.petsService.getPetByToken(tokenAcceso);
  }

  @Post('public/:token/scan')
  @Public()
  @ApiOperation({
    summary: 'Registrar escaneo QR con ubicación opcional',
    description:
      'Registra que alguien escaneó el QR de la mascota. ' +
      'Enviar lat/lng si el escáner otorgó permiso de ubicación; omitirlos si rechazó. ' +
      'Sin JWT requerido.',
  })
  registerScan(@Param('token', ParseUUIDPipe) tokenAcceso: string, @Body() dto: ScanDto) {
    return this.petsService.registerScan(tokenAcceso, dto);
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
  @ApiOperation({
    summary: 'Obtener QR de la placa',
    description:
      '?format=svg → SVG vectorial listo para escalar/imprimir (recomendado). ' +
      '?format=png → data URL base64 PNG (default). ' +
      '?size=600 controla el tamaño del PNG (100–1000, default 300). ' +
      'Android convierte el SVG a PDF/JPEG/PNG localmente con AndroidSVG + PdfDocument.',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['png', 'svg'],
    description: 'Formato de salida. Default png.',
  })
  @ApiQuery({
    name: 'size',
    required: false,
    type: Number,
    description: 'Tamaño PNG en px (100–1000). Default 300. Ignorado si format=svg.',
  })
  async getQr(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Query('size', new ParseIntPipe({ optional: true })) size?: number,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const fmt = format === 'svg' ? 'svg' : 'png';
    const content = await this.petsService.getQr(mascotaId, personaId, size, fmt);
    if (fmt === 'svg' && res) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', 'attachment; filename="qr.svg"');
    }
    return content;
  }

  @Post(':id/alert/community')
  @ApiOperation({
    summary: 'Enviar alerta de búsqueda a usuarios cercanos (botón manual)',
    description:
      'Envía push FCM a usuarios activos dentro del radio indicado (excluye a los propietarios). ' +
      'Requiere que la mascota tenga ubicación GPS registrada. Radio default: 5 000 m.',
  })
  sendCommunityAlert(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: CommunityAlertDto,
  ) {
    return this.petsService.sendCommunityAlert(mascotaId, personaId, dto.radio ?? 5000);
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
  @ApiOperation({
    summary: 'Agregar fotos a la mascota (no reemplaza las existentes; máx. 4 fotos totales)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fotos'],
      properties: {
        fotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description:
            '1 a 4 imágenes (jpeg, png, webp, gif — máx. 5 MB cada una). La suma con las fotos existentes no puede exceder 4.',
        },
        fotoPrincipalIndex: {
          type: 'integer',
          description:
            'Opcional. Índice 0-based de las NUEVAS fotos que pasará a ser principal. Si se omite, la foto principal actual se mantiene.',
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
  addPhotos(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('fotoPrincipalIndex') principalIndexStr?: string,
  ) {
    const principalIndex =
      principalIndexStr !== undefined ? parseInt(principalIndexStr, 10) : undefined;
    return this.petsService.uploadPhotos(mascotaId, personaId, files ?? [], principalIndex);
  }

  @Get(':id/medical')
  @ApiOperation({ summary: 'Listar registros médicos de la mascota (vacunas, consultas, etc.)' })
  getMedicalRecords(@Param('id') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.petsService.getMedicalRecords(mascotaId, personaId);
  }

  @Post(':id/medical')
  @ApiOperation({ summary: 'Agregar registro médico (vacuna, consulta, cirugía, etc.)' })
  addMedicalRecord(
    @Param('id') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: CreateMedicalRecordDto,
  ) {
    return this.petsService.addMedicalRecord(mascotaId, personaId, dto);
  }

  @Put(':id/medical/:registroId')
  @ApiOperation({ summary: 'Editar un registro médico (todos los campos opcionales)' })
  updateMedicalRecord(
    @Param('id') mascotaId: string,
    @Param('registroId', ParseIntPipe) registroId: number,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: UpdateMedicalRecordDto,
  ) {
    return this.petsService.updateMedicalRecord(mascotaId, personaId, registroId, dto);
  }

  @Delete(':id/medical/:registroId')
  @ApiOperation({ summary: 'Eliminar un registro médico' })
  removeMedicalRecord(
    @Param('id') mascotaId: string,
    @Param('registroId', ParseIntPipe) registroId: number,
    @CurrentUser('personaId') personaId: string,
  ) {
    return this.petsService.removeMedicalRecord(mascotaId, personaId, registroId);
  }

  @Get(':id/scans')
  @ApiOperation({
    summary: 'Historial de escaneos QR de la mascota',
    description:
      'Devuelve todos los escaneos registrados del QR de la mascota, ordenados del más reciente al más antiguo. ' +
      'Cada registro incluye coordenadas GPS si el escaneador las compartió.',
  })
  getScans(@Param('id') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.petsService.getScans(mascotaId, personaId);
  }

  @Get(':id/reports')
  @ApiOperation({
    summary: 'Historial de reportes de extravío de la mascota',
    description:
      'Lista todos los reportes de extravío (abiertos y cerrados) con la última ubicación conocida al momento del reporte.',
  })
  getReports(@Param('id') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.petsService.getReports(mascotaId, personaId);
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
