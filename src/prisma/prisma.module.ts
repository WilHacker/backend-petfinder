import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Esto hace que no tengas que importar el módulo en cada sitio
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
