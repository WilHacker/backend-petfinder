import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeofencingService } from './geofencing.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Geofencing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('geofencing/pets/:petId/zones')
export class GeofencingController {
  constructor(private readonly geofencingService: GeofencingService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar zona segura en el mapa' })
  createZone(
    @Param('petId') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: CreateZoneDto,
  ) {
    return this.geofencingService.createZone(mascotaId, personaId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar zonas seguras de una mascota' })
  findZones(@Param('petId') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.geofencingService.findZones(mascotaId, personaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una zona segura' })
  findZone(
    @Param('petId') mascotaId: string,
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
  ) {
    return this.geofencingService.findZone(mascotaId, zonaId, personaId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar zona segura' })
  updateZone(
    @Param('petId') mascotaId: string,
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: UpdateZoneDto,
  ) {
    return this.geofencingService.updateZone(mascotaId, zonaId, personaId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar zona segura' })
  removeZone(
    @Param('petId') mascotaId: string,
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
  ) {
    return this.geofencingService.removeZone(mascotaId, zonaId, personaId);
  }
}
