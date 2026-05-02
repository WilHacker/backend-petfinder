import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { AddOwnerDto } from './dto/add-owner.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Pets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar perfil de mascota (crea QR automáticamente)' })
  create(@CurrentUser('personaId') personaId: string, @Body() dto: CreatePetDto) {
    return this.petsService.create(personaId, dto);
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
}
