import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MapService } from './map.service';

@ApiTags('Map')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('snapshot')
  @ApiOperation({
    summary:
      'Carga inicial del mapa — mascotas propias con zonas, co-propietarios y mascotas desaparecidas',
    description:
      'Devuelve en una sola llamada toda la data geoespacial necesaria para renderizar ' +
      'la pantalla principal del mapa. Todas las coordenadas vienen en { lat, lng } ' +
      'listas para Google Maps SDK.',
  })
  getSnapshot(@CurrentUser('personaId') personaId: string) {
    return this.mapService.getSnapshot(personaId);
  }
}
