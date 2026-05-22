import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

export interface PetLocationPayload {
  mascotaId: string;
  lat: number;
  lng: number;
  estado: string;
  fechaActualizacion: Date;
}

export interface OwnerLocationPayload {
  personaId: string;
  usuarioId: string;
  lat: number;
  lng: number;
  fechaActualizacion: Date;
}

export interface PetStatusPayload {
  mascotaId: string;
  nombre: string;
  estado: string;
  fechaCambio: Date;
}

export interface PetRegisteredPayload {
  mascotaId: string;
  nombre: string;
  estado: string;
  fotoPrincipalUrl: string | null;
}

export interface OwnerAddedPayload {
  mascotaId: string;
  personaId: string;
  nombreCompleto: string;
  tipoRelacion: string;
  fechaAgregado: Date;
}

export interface ZoneEventPayload {
  mascotaId: string;
  zonaId: number;
  fechaHora: Date;
  duracionMinutos?: number;
}

export interface PetProfileUpdatedPayload {
  mascotaId: string;
  nombre?: string;
  colorPrimario?: string;
  rasgosParticulares?: string;
  fechaActualizacion: Date;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Emite ubicación actualizada de una mascota en_paseo a su room.
   */
  emitPetLocationUpdated(payload: PetLocationPayload): void {
    if (!this.server) return;
    const room = `pet:${payload.mascotaId}`;
    this.server.to(room).emit('pet:location-updated', payload);
    this.logger.debug(`[WS] pet:location-updated → room ${room}`);
  }

  /**
   * Emite ubicación del dueño a todos los rooms de sus mascotas
   * para que co-propietarios vean su marcador moverse (#32 en tiempo real).
   */
  emitOwnerLocationUpdated(petRooms: string[], payload: OwnerLocationPayload): void {
    if (!this.server || petRooms.length === 0) return;
    petRooms.forEach((room) => {
      this.server!.to(room).emit('owner:location-updated', payload);
    });
    this.logger.debug(`[WS] owner:location-updated → ${petRooms.length} rooms`);
  }

  /**
   * Emite cambio de estado de mascota a todos los propietarios del room.
   */
  emitPetStatusChanged(payload: PetStatusPayload): void {
    if (!this.server) return;
    const room = `pet:${payload.mascotaId}`;
    this.server.to(room).emit('pet:status-changed', payload);
    this.logger.debug(`[WS] pet:status-changed → room ${room} (${payload.estado})`);
  }

  /**
   * Notifica al dueño que su nueva mascota fue registrada y la une al room.
   * El socket del dueño es forzado a unirse a pet:{mascotaId} sin reconectar.
   */
  emitPetRegistered(usuarioId: string, payload: PetRegisteredPayload): void {
    if (!this.server) return;
    const userRoom = `user:${usuarioId}`;
    const petRoom = `pet:${payload.mascotaId}`;

    // Fuerza todos los sockets del dueño a unirse al room de la nueva mascota
    this.server.in(userRoom).socketsJoin(petRoom);

    this.server.to(userRoom).emit('pet:registered', payload);
    this.logger.debug(`[WS] pet:registered → ${userRoom} | joined ${petRoom}`);
  }

  /**
   * Notifica a todos los propietarios existentes que se agregó un nuevo dueño/cuidador.
   * Fuerza al nuevo owner a unirse al room de la mascota sin reconectar.
   */
  emitPetProfileUpdated(payload: PetProfileUpdatedPayload): void {
    if (!this.server) return;
    const room = `pet:${payload.mascotaId}`;
    this.server.to(room).emit('pet:profile-updated', payload);
    this.logger.debug(`[WS] pet:profile-updated → room ${room}`);
  }

  emitPetEnteredZone(payload: ZoneEventPayload): void {
    if (!this.server) return;
    const room = `pet:${payload.mascotaId}`;
    this.server.to(room).emit('pet:entered-zone', payload);
    this.logger.debug(`[WS] pet:entered-zone → room ${room} (zona ${payload.zonaId})`);
  }

  emitPetExitedZone(payload: ZoneEventPayload): void {
    if (!this.server) return;
    const room = `pet:${payload.mascotaId}`;
    this.server.to(room).emit('pet:exited-zone', payload);
    this.logger.debug(`[WS] pet:exited-zone → room ${room} (zona ${payload.zonaId})`);
  }

  emitOwnerAdded(
    mascotaId: string,
    newOwnerUsuarioId: string | null,
    payload: OwnerAddedPayload,
  ): void {
    if (!this.server) return;
    const petRoom = `pet:${mascotaId}`;

    if (newOwnerUsuarioId) {
      const newOwnerUserRoom = `user:${newOwnerUsuarioId}`;
      // Fuerza al nuevo propietario a unirse al room de la mascota
      this.server.in(newOwnerUserRoom).socketsJoin(petRoom);
      // Notifica al nuevo propietario que fue agregado
      this.server.to(newOwnerUserRoom).emit('pet:assigned', payload);
    }

    // Notifica a todos los propietarios existentes en el room
    this.server.to(petRoom).emit('owner:added', payload);
    this.logger.debug(`[WS] owner:added → room ${petRoom}`);
  }
}
