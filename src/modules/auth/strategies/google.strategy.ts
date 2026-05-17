import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): { email: string; nombre: string; apellidoPaterno: string; fotoPerfilUrl?: string } {
    const email = profile.emails?.[0]?.value ?? '';
    const nombre = profile.name?.givenName ?? profile.displayName ?? 'Usuario';
    const apellidoPaterno = profile.name?.familyName ?? 'Google';
    const fotoPerfilUrl = profile.photos?.[0]?.value;

    return { email, nombre, apellidoPaterno, fotoPerfilUrl };
  }
}
