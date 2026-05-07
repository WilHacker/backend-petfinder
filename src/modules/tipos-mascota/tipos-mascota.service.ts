import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TiposMascotaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tipoMascota.findMany({
      orderBy: { tipoId: 'asc' },
    });
  }
}
