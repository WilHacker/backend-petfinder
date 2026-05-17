import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TiposMascotaService } from './tipos-mascota.service';

@ApiTags('Tipos de Mascota')
@Controller('tipos-mascota')
export class TiposMascotaController {
  constructor(private readonly tiposMascotaService: TiposMascotaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Listar todos los tipos de mascota' })
  findAll() {
    return this.tiposMascotaService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear tipo de mascota (solo admin)' })
  create(@Body('nombre') nombre: string) {
    return this.tiposMascotaService.create(nombre);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar tipo de mascota (solo admin)' })
  remove(@Param('id', ParseIntPipe) tipoId: number) {
    return this.tiposMascotaService.remove(tipoId);
  }
}
