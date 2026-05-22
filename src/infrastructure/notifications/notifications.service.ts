import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private app: admin.app.App | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase no configurado — las notificaciones push están deshabilitadas');
      return;
    }

    if (!admin.apps.length) {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      this.app = admin.app();
    }

    this.logger.log('Firebase Admin inicializado correctamente');
  }

  async sendPetLostAlert(mascotaId: string) {
    try {
      if (!this.app) return;

      const propietarios = await this.prisma.propietarioMascota.findMany({
        where: { mascotaId, recibeAlertas: true },
        include: {
          mascota: { select: { nombre: true } },
          persona: { include: { usuario: { select: { tokenFcm: true } } } },
        },
      });

      const tokens = propietarios
        .map((p) => p.persona.usuario?.tokenFcm)
        .filter((t): t is string => !!t);

      if (!tokens.length) return;

      const mascotaNombre = propietarios[0]?.mascota.nombre ?? 'Tu mascota';

      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `¡${mascotaNombre} está desaparecida!`,
          body: 'Activa la búsqueda y revisa su última ubicación conocida.',
        },
        data: { mascotaId, tipo: 'mascota_extraviada' },
      });

      this.logger.log(
        `Alerta de extravío enviada a ${tokens.length} dispositivo(s) — mascota: ${mascotaId}`,
      );
    } catch (err) {
      this.logger.error(`sendPetLostAlert falló (mascota ${mascotaId})`, err as Error);
    }
  }

  async sendQrScanAlert(mascotaId: string, lat: number, lng: number) {
    try {
      if (!this.app) return;

      const propietarios = await this.prisma.propietarioMascota.findMany({
        where: { mascotaId, recibeAlertas: true },
        include: {
          mascota: { select: { nombre: true } },
          persona: { include: { usuario: { select: { tokenFcm: true } } } },
        },
      });

      const tokens = propietarios
        .map((p) => p.persona.usuario?.tokenFcm)
        .filter((t): t is string => !!t);

      if (!tokens.length) return;

      const mascotaNombre = propietarios[0]?.mascota.nombre ?? 'Tu mascota';
      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `¡Alguien encontró a ${mascotaNombre}!`,
          body: `Se escaneó el QR. Toca para ver la ubicación en el mapa.`,
        },
        data: { mascotaId, tipo: 'qr_escaneado', lat: String(lat), lng: String(lng), mapsUrl },
      });

      this.logger.log(`Alerta de escaneo QR enviada — mascota: ${mascotaId} lat:${lat} lng:${lng}`);
    } catch (err) {
      this.logger.error(`sendQrScanAlert falló (mascota ${mascotaId})`, err as Error);
    }
  }

  async sendRadiusAlert(mascotaId: string, radioMetros = 5000) {
    try {
      if (!this.app) return;

      const rows = await this.prisma.$queryRaw<Array<{ lat: number; lng: number; nombre: string }>>`
        SELECT
          ST_Y(ultima_ubicacion_conocida::geometry) AS lat,
          ST_X(ultima_ubicacion_conocida::geometry) AS lng,
          nombre
        FROM mascotas
        WHERE mascota_id = ${mascotaId}::uuid
          AND ultima_ubicacion_conocida IS NOT NULL
      `;
      if (!rows.length) return;

      const { lat, lng, nombre } = rows[0];

      const usuarios = await this.prisma.$queryRaw<Array<{ token_fcm: string }>>`
        SELECT DISTINCT u.token_fcm
        FROM usuarios u
        WHERE u.token_fcm IS NOT NULL
          AND u.ultima_ubicacion_conocida IS NOT NULL
          AND u.estado_cuenta = 'activa'
          AND u.usuario_id NOT IN (
            SELECT u2.usuario_id
            FROM propietarios_mascota pm
            JOIN personas p ON p.persona_id = pm.persona_id
            JOIN usuarios u2 ON u2.persona_id = p.persona_id
            WHERE pm.mascota_id = ${mascotaId}::uuid
          )
          AND ST_DWithin(
            u.ultima_ubicacion_conocida::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radioMetros}
          )
      `;

      const tokens = usuarios.map((u) => u.token_fcm).filter(Boolean);
      if (!tokens.length) return;

      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: '¡Mascota perdida cerca de ti!',
          body: `${nombre} está extraviada en tu área. ¿Puedes ayudar a encontrarla?`,
        },
        data: { mascotaId, tipo: 'alerta_radio', lat: String(lat), lng: String(lng) },
      });

      this.logger.log(
        `Alerta radio enviada a ${tokens.length} usuario(s) (radio: ${radioMetros}m) — mascota: ${mascotaId}`,
      );
    } catch (err) {
      this.logger.error(`sendRadiusAlert falló (mascota ${mascotaId})`, err as Error);
    }
  }

  async sendZoneAlert(mascotaId: string) {
    try {
      if (!this.app) return;

      // Obtiene la última ubicación conocida de la mascota extraviada
      const rows = await this.prisma.$queryRaw<Array<{ lat: number; lng: number; nombre: string }>>`
      SELECT
        ST_Y(ultima_ubicacion_conocida::geometry) AS lat,
        ST_X(ultima_ubicacion_conocida::geometry) AS lng,
        nombre
      FROM mascotas
      WHERE mascota_id = ${mascotaId}::uuid
        AND ultima_ubicacion_conocida IS NOT NULL
    `;

      if (!rows.length) return;

      const { lat, lng, nombre } = rows[0];

      // Usuarios con zonas seguras (de sus mascotas) que intersectan la ubicación perdida
      const usuarios = await this.prisma.$queryRaw<Array<{ token_fcm: string }>>`
      SELECT DISTINCT u.token_fcm
      FROM propietarios_mascota pm
      JOIN usuarios u ON u.persona_id = pm.persona_id
      JOIN zona_mascotas zm ON zm.mascota_id = pm.mascota_id
      JOIN zonas_seguras z ON z.zona_id = zm.zona_id
      WHERE u.token_fcm IS NOT NULL
        AND pm.recibe_alertas = true
        AND pm.mascota_id != ${mascotaId}::uuid
        AND z.esta_activa = true
        AND ST_DWithin(
          COALESCE(z.geometria, ST_Buffer(z.punto_central::geography, z.radio_metros))::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          5000
        )
    `;

      const tokens = usuarios.map((u) => u.token_fcm).filter(Boolean);
      if (!tokens.length) return;

      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: '¡Mascota perdida cerca de tu zona!',
          body: `${nombre} está extraviada cerca de tu área. ¿Puedes ayudar?`,
        },
        data: { mascotaId, tipo: 'mascota_en_zona', lat: String(lat), lng: String(lng) },
      });

      this.logger.log(
        `Alerta de zona enviada a ${tokens.length} usuario(s) — mascota: ${mascotaId}`,
      );
    } catch (err) {
      this.logger.error(`sendZoneAlert falló (mascota ${mascotaId})`, err as Error);
    }
  }
}
