import { Module } from '@nestjs/common';
import { TiposMascotaController } from './tipos-mascota.controller';
import { TiposMascotaService } from './tipos-mascota.service';

@Module({
  controllers: [TiposMascotaController],
  providers: [TiposMascotaService],
})
export class TiposMascotaModule {}
