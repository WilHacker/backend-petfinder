import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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

  @Put(':id/read')
  @ApiOperation({
    summary: 'Marcar hilo como leído',
    description:
      'El frontend llama a este endpoint cada vez que el usuario abre un hilo de conversación. ' +
      'Actualiza el timestamp de última lectura, lo que hace que noLeidos baje a 0 para ese avistamiento.',
  })
  markAsRead(
    @Param('id', ParseUUIDPipe) avistamientoId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.sightingsService.markAsRead(avistamientoId, usuarioId);
  }

  @Get('my-pets/threads')
  @ApiOperation({
    summary: 'Lista de conversaciones del dueño (pestaña "Mis mascotas")',
    description:
      'Devuelve todas las mascotas del usuario autenticado con el avistamiento más reciente ' +
      'que tenga actividad de comentarios. Si una mascota no tiene conversaciones, ' +
      'aparece con avistamiento: null. noLeidos es siempre 0 en esta versión.',
  })
  getMyPetsThreads(@CurrentUser('sub') usuarioId: string) {
    return this.sightingsService.getMyPetsThreads(usuarioId);
  }

  @Get('my-participations')
  @ApiOperation({
    summary: 'Lista de conversaciones del rescatista (pestaña "Ayudé")',
    description:
      'Devuelve los avistamientos donde el usuario autenticado comentó, ' +
      'con el último mensaje propio, la última respuesta del dueño y la calificación recibida. ' +
      'noLeidos es siempre 0 en esta versión.',
  })
  getMyParticipations(@CurrentUser('sub') usuarioId: string) {
    return this.sightingsService.getMyParticipations(usuarioId);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Badge de no leídos para el navbar',
    description:
      'Devuelve el conteo de mensajes no leídos. ' +
      'En esta versión retorna siempre 0 — el tracking real se implementa en el siguiente sprint.',
  })
  getUnreadCount(@CurrentUser('sub') usuarioId: string) {
    return this.sightingsService.getUnreadCount(usuarioId);
  }

  @Post(':id/comments')
  @UseInterceptors(FileInterceptor('foto', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mensaje: { type: 'string', example: 'Lo vi cerca del parque central, estaba solo' },
        lat: {
          type: 'number',
          example: -17.3935,
          description: 'Solo se guarda si se adjunta foto (privacidad)',
        },
        lng: { type: 'number', example: -66.157 },
        replyToUserId: {
          type: 'string',
          format: 'uuid',
          description: 'UUID del comentarista al que el dueño responde (hilo privado bilateral)',
        },
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
  @ApiOperation({
    summary: 'Ver comentarios de un avistamiento',
    description:
      'Requiere JWT. El dueño ve todos los comentarios. ' +
      'Un comentarista solo ve sus propios mensajes y las respuestas del dueño dirigidas a él.',
  })
  getComments(
    @Param('id', ParseUUIDPipe) avistamientoId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.sightingsService.getComments(avistamientoId, usuarioId);
  }
}
