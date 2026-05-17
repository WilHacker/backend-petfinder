import { RolUsuario } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  personaId: string;
  rol: RolUsuario;
  iat?: number;
  exp?: number;
}
