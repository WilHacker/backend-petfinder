import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  getSnapshot(@CurrentUser('personaId') personaId: string) {
    return this.mapService.getSnapshot(personaId);
  }

  @Get('public/lost-pets')
  @Public()
  @ApiOperation({
    summary: 'Mascotas desaparecidas en el mapa — acceso público sin autenticación',
    description:
      'Devuelve las últimas 100 mascotas con reporte de extravío abierto y ubicación conocida. ' +
      'No requiere token. Ideal para mostrar en la pantalla pública de la app o en una web de búsqueda.',
  })
  getPublicLostPets() {
    return this.mapService.getPublicLostPets();
  }
}
