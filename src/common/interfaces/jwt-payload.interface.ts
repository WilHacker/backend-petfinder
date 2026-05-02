export interface JwtPayload {
  sub: string;
  personaId: string;
  iat?: number;
  exp?: number;
}
