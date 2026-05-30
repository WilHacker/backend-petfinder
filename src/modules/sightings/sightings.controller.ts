import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SightingsService } from './sightings.service';
import { CreateSightingDto } from './dto/create-sighting.dto';
import { CreateThanksDto } from './dto/create-thanks.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

@ApiTags('Sightings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sightings')
export class SightingsController {
  constructor(private readonly sightingsService: SightingsService) {}

  @Post('pets/:petId')
  @Public()
  @UseInterceptors(FileInterceptor('foto', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['lat', 'lng'],
      properties: {
        lat: { type: 'number', example: -17.3935 },
        lng: { type: 'number', example: -66.157 },
        mensajeRescatista: { type: 'string', example: 'Lo vi cerca del mercado central' },
        foto: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Reportar avistamiento de una mascota con foto opcional',
    description:
      'Endpoint público — no requiere JWT. Cualquiera que vio la mascota puede reportar ' +
      'su ubicación, un mensaje y una foto del lugar. lat y lng son requeridos. ' +
      'El dueño recibe push FCM y evento WebSocket sighting:new.',
  })
  createSighting(
    @Param('petId', ParseUUIDPipe) mascotaId: string,
    @Body() dto: CreateSightingDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.sightingsService.createSighting(mascotaId, dto, file);
  }

  @Get('pets/:petId')
  @ApiOperation({
    summary: 'Listar avistamientos de una mascota',
    description:
      'Solo el dueño o cuidador puede ver el historial. Ordenado del más reciente al más antiguo.',
  })
  getSightings(
    @Param('petId', ParseUUIDPipe) mascotaId: string,
    @CurrentUser('personaId') personaId: string,
  ) {
    return this.sightingsService.getSightings(mascotaId, personaId);
  }

  @Post(':id/thanks')
  @ApiOperation({
    summary: 'Publicar agradecimiento a un rescatista',
    description: 'Solo el dueño de la mascota puede agradecer. Requiere JWT.',
  })
  createThanks(
    @Param('id', ParseUUIDPipe) avistamientoId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateThanksDto,
  ) {
    return this.sightingsService.createThanks(avistamientoId, usuarioId, dto);
  }

  @Get(':id/thanks')
  @Public()
  @ApiOperation({
    summary: 'Ver agradecimientos de un avistamiento',
    description: 'Público — cualquiera puede ver los agradecimientos del dueño al rescatista.',
  })
  getThanks(@Param('id', ParseUUIDPipe) avistamientoId: string) {
    return this.sightingsService.getThanks(avistamientoId);
  }

  @Post(':id/comments')
  @UseInterceptors(FileInterceptor('foto', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mensaje'],
      properties: {
        mensaje: { type: 'string', example: 'Lo vi cerca del parque central, estaba solo' },
        lat: {
          type: 'number',
          example: -17.3935,
          description: 'Solo se guarda si se adjunta foto (privacidad)',
        },
        lng: { type: 'number', example: -66.157 },
        foto: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Comentar en un avistamiento',
    description:
      'Cualquier usuario autenticado puede aportar información adicional. ' +
      'Si se adjunta foto, se guarda la ubicación lat/lng (la persona estaba físicamente ahí). ' +
      'Sin foto, la ubicación se descarta para proteger la privacidad del comentarista. ' +
      'El dueño recibe push FCM y evento WebSocket sighting:comment-new.',
  })
  createComment(
    @Param('id', ParseUUIDPipe) avistamientoId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateCommentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.sightingsService.createComment(avistamientoId, usuarioId, dto, file);
  }

  @Get(':id/comments')
  @Public()
  @ApiOperation({
    summary: 'Ver comentarios de un avistamiento',
    description:
      'Público. Devuelve comentarios con autor, foto y ubicación (solo si fue enviada con foto).',
  })
  getComments(@Param('id', ParseUUIDPipe) avistamientoId: string) {
    return this.sightingsService.getComments(avistamientoId);
  }

  @Post(':id/rating')
  @ApiOperation({
    summary: 'Calificar un avistamiento (solo dueño)',
    description:
      'El dueño confirma si el avistamiento fue verídico y asigna estrellas al rescatista (1–5). ' +
      'Se puede actualizar: hace upsert. Emite evento WebSocket sighting:rated.',
  })
  createRating(
    @Param('id', ParseUUIDPipe) avistamientoId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.sightingsService.createRating(avistamientoId, usuarioId, dto);
  }

  @Get(':id/rating')
  @Public()
  @ApiOperation({
    summary: 'Ver calificación de un avistamiento',
    description: 'Público. Retorna null si el dueño aún no ha calificado.',
  })
  getRating(@Param('id', ParseUUIDPipe) avistamientoId: string) {
    return this.sightingsService.getRating(avistamientoId);
  }
}
