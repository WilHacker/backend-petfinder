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
@Controller('geofencing')
export class GeofencingController {
  constructor(private readonly geofencingService: GeofencingService) {}

  @Post('pets/:petId/zones')
  @ApiOperation({
    summary: 'Crear zona segura y asociarla a una o más mascotas',
    description:
      'El :petId del URL es la mascota principal (debe ser tuya). ' +
      'Puedes asociar mascotas adicionales con el campo mascotaIds en el body.',
  })
  createZone(
    @Param('petId') mascotaId: string,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: CreateZoneDto,
  ) {
    return this.geofencingService.createZone(mascotaId, personaId, dto);
  }

  @Get('pets/:petId/zones')
  @ApiOperation({ summary: 'Listar zonas donde está registrada una mascota' })
  findZones(@Param('petId') mascotaId: string, @CurrentUser('personaId') personaId: string) {
    return this.geofencingService.findZones(mascotaId, personaId);
  }

  @Get('zones/:id')
  @ApiOperation({ summary: 'Detalle de una zona segura' })
  findZone(@Param('id', ParseIntPipe) zonaId: number, @CurrentUser('personaId') personaId: string) {
    return this.geofencingService.findZone(zonaId, personaId);
  }

  @Put('zones/:id')
  @ApiOperation({ summary: 'Actualizar zona segura' })
  updateZone(
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: UpdateZoneDto,
  ) {
    return this.geofencingService.updateZone(zonaId, personaId, dto);
  }

  @Delete('zones/:id')
  @ApiOperation({ summary: 'Eliminar zona segura' })
  removeZone(
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
  ) {
    return this.geofencingService.removeZone(zonaId, personaId);
  }
}
