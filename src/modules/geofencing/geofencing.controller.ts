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
import { ManageZonePetsDto } from './dto/manage-zone-pets.dto';
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

  @Get('zones')
  @ApiOperation({ summary: 'Listar todas mis zonas seguras con sus mascotas y tipo de zona' })
  findMyZones(@CurrentUser('personaId') personaId: string) {
    return this.geofencingService.findMyZones(personaId);
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

  @Post('zones/:id/pets')
  @ApiOperation({
    summary: 'Agregar mascotas a una zona existente (mín. 1)',
    description:
      'Asigna las mascotas indicadas a la zona. Las que ya estaban asignadas se ignoran (idempotente). ' +
      'Solo puedes agregar mascotas de las que eres propietario o cuidador.',
  })
  addPetsToZone(
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: ManageZonePetsDto,
  ) {
    return this.geofencingService.addPetsToZone(zonaId, personaId, dto);
  }

  @Put('zones/:id/pets')
  @ApiOperation({
    summary: 'Reemplazar la lista completa de mascotas de una zona (mín. 1)',
    description:
      'Desasigna todas las mascotas actuales y asigna las indicadas en el body. ' +
      'Útil para sincronizar la lista desde la app. Mínimo 1 mascota requerida.',
  })
  replacePetsInZone(
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: ManageZonePetsDto,
  ) {
    return this.geofencingService.replacePetsInZone(zonaId, personaId, dto);
  }

  @Delete('zones/:id/pets')
  @ApiOperation({
    summary: 'Desasignar mascotas de una zona (mín. 1)',
    description:
      'Elimina la asociación entre las mascotas indicadas y la zona. ' +
      'Si alguna no estaba asignada se ignora. No elimina la zona ni las mascotas.',
  })
  removePetsFromZone(
    @Param('id', ParseIntPipe) zonaId: number,
    @CurrentUser('personaId') personaId: string,
    @Body() dto: ManageZonePetsDto,
  ) {
    return this.geofencingService.removePetsFromZone(zonaId, personaId, dto);
  }
}
