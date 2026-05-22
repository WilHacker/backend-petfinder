import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { MapService } from './map.service';

@ApiTags('Map')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('snapshot')
  @ApiOperation({
    summary: 'Carga inicial del mapa — mascotas propias, co-propietarios y mascotas desaparecidas',
    description:
      'Devuelve en una sola llamada toda la data geoespacial para renderizar ' +
      'la pantalla principal del mapa. Requiere autenticación.',
  })
  @ApiQuery({
    name: 'tipoId',
    required: false,
    type: Number,
    description:
      'Filtrar mascotas desaparecidas por tipo (ID de tipos-mascota). Sin valor = todas.',
  })
  getSnapshot(
    @CurrentUser('personaId') personaId: string,
    @Query('tipoId', new ParseIntPipe({ optional: true })) tipoId?: number,
  ) {
    return this.mapService.getSnapshot(personaId, tipoId);
  }

  @Get('public/lost-pets')
  @Public()
  @ApiOperation({
    summary: 'Mascotas desaparecidas en el mapa — acceso público sin autenticación',
    description:
      'Devuelve las últimas 100 mascotas con reporte de extravío abierto y ubicación conocida. ' +
      'No requiere token. Ideal para mostrar en la pantalla pública de la app o en una web de búsqueda.',
  })
  @ApiQuery({
    name: 'tipoId',
    required: false,
    type: Number,
    description:
      'Filtrar por tipo de mascota (ID de tipos-mascota). Sin valor = todas las especies.',
  })
  getPublicLostPets(@Query('tipoId', new ParseIntPipe({ optional: true })) tipoId?: number) {
    return this.mapService.getPublicLostPets(tipoId);
  }
}
