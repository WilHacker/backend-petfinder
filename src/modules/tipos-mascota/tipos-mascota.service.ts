import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TiposMascotaService {
  findAll() {
    return this.prisma.tipoMascota.findMany({ orderBy: { tipoId: 'asc' } });
  }

  async create(nombre: string) {
    const exists = await this.prisma.tipoMascota.findFirst({ where: { nombre } });
    if (exists) throw new ConflictException(`El tipo "${nombre}" ya existe`);
    return this.prisma.tipoMascota.create({ data: { nombre } });
  }

  async remove(tipoId: number) {
    const tipo = await this.prisma.tipoMascota.findUnique({ where: { tipoId } });
    if (!tipo) throw new NotFoundException('Tipo de mascota no encontrado');
    return this.prisma.tipoMascota.delete({ where: { tipoId } });
  }

  constructor(private readonly prisma: PrismaService) {}
}
