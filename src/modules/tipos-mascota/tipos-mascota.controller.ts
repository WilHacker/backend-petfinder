import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { TiposMascotaService } from './tipos-mascota.service';

@ApiTags('Tipos de Mascota')
@Public()
@Controller('tipos-mascota')
export class TiposMascotaController {
  constructor(private readonly tiposMascotaService: TiposMascotaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los tipos de mascota' })
  findAll() {
    return this.tiposMascotaService.findAll();
  }
}
