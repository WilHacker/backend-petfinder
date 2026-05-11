import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

interface JwtPayload {
  sub: string;
  personaId: string;
}

@WebSocketGateway({
  namespace: 'realtime',
  cors: { origin: '*', credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    // Entrega el Server al servicio para que otros módulos puedan emitir
    this.realtimeService.setServer(server);
    this.logger.log('WebSocket Gateway inicializado en /realtime');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const rawToken =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers?.authorization;

      const token = rawToken?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('Token ausente');

      const payload = this.jwtService.verify<JwtPayload>(token);
      client.data.usuarioId = payload.sub;
      client.data.personaId = payload.personaId;

      // Une al usuario a los rooms de todas sus mascotas
      const relaciones = await this.prisma.propietarioMascota.findMany({
        where: { personaId: payload.personaId },
        select: { mascotaId: true },
      });

      const petRooms = relaciones.map((r) => `pet:${r.mascotaId}`);
      if (petRooms.length > 0) await client.join(petRooms);

      // Room personal para mensajes directos futuros
      await client.join(`user:${payload.sub}`);

      this.logger.log(`[WS] Conectado: ${payload.sub} | rooms: ${petRooms.length} mascotas`);
    } catch {
      this.logger.warn(`[WS] Conexión rechazada — token inválido`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`[WS] Desconectado: ${client.data?.usuarioId ?? 'anon'}`);
  }
}
