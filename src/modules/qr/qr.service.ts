import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../infrastructure/notifications/notifications.service';
import { EstadoMascota } from '@prisma/client';

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getPetByToken(tokenAcceso: string) {
    const placa = await this.prisma.placaQr.findUnique({
      where: { tokenAcceso },
      select: {
        estaActiva: true,
        mascota: {
          select: {
            mascotaId: true,
            nombre: true,
            sexo: true,
            colorPrimario: true,
            rasgosParticulares: true,
            estado: true,
            tipoMascota: { select: { nombre: true } },
            fotos: {
              select: { fotoId: true, fotoUrl: true, esPrincipal: true },
              orderBy: [{ esPrincipal: 'desc' }, { fotoId: 'asc' }],
            },
            fichaMedica: {
              select: {
                alergias: true,
                enfermedadesCronicas: true,
                medicacionDiaria: true,
                tipoSangre: true,
                notasVeterinarias: true,
              },
            },
            registrosMedicos: {
              select: {
                registroId: true,
                tipo: true,
                descripcion: true,
                fecha: true,
                veterinario: true,
              },
              orderBy: { fecha: 'desc' },
            },
            propietarios: {
              select: {
                tipoRelacion: true,
                mostrarEnQr: true,
                persona: {
                  select: {
                    personaId: true,
                    nombre: true,
                    apellidoPaterno: true,
                    fotoPerfilUrl: true,
                    mediosContacto: { select: { tipo: true, valor: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!placa || !placa.estaActiva || !placa.mascota)
      throw new NotFoundException('QR no válido o inactivo');

    const m = placa.mascota;
    return {
      mascotaId: m.mascotaId,
      nombre: m.nombre,
      tipo: m.tipoMascota?.nombre ?? null,
      sexo: m.sexo,
      colorPrimario: m.colorPrimario,
      rasgosParticulares: m.rasgosParticulares,
      estado: m.estado,
      estaExtraviada: m.estado === EstadoMascota.extraviada,
      fotos: m.fotos.map((f) => ({
        fotoId: f.fotoId,
        url: f.fotoUrl,
        esPrincipal: f.esPrincipal ?? false,
      })),
      fichaMedica: m.fichaMedica ?? null,
      registrosMedicos: m.registrosMedicos,
      propietarios: m.propietarios
        .filter((p) => p.mostrarEnQr !== false)
        .map((p) => ({
          personaId: p.persona.personaId,
          nombreCompleto: `${p.persona.nombre} ${p.persona.apellidoPaterno}`.trim(),
          fotoPerfilUrl: p.persona.fotoPerfilUrl,
          tipoRelacion: p.tipoRelacion,
          contactos: p.persona.mediosContacto.map((c) => ({ tipo: c.tipo, valor: c.valor })),
        })),
    };
  }

  async registerScan(tokenAcceso: string, lat?: number, lng?: number) {
    const placa = await this.prisma.placaQr.findUnique({
      where: { tokenAcceso },
      select: { estaActiva: true, mascotaId: true },
    });

    if (!placa || !placa.estaActiva || !placa.mascotaId)
      throw new NotFoundException('QR no válido o inactivo');

    await this.prisma.escaneoQr.create({
      data: {
        mascotaId: placa.mascotaId,
        lat: lat ?? null,
        lng: lng ?? null,
      },
    });

    if (lat !== undefined && lng !== undefined) {
      void this.notifications.sendQrScanAlert(placa.mascotaId, lat, lng);
    }

    return { message: 'Escaneo registrado' };
  }
}
