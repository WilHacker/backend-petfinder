import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Auth')
@Controller('auth')
@Throttle({ default: { ttl: 60000, limit: 10 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Registrar cuenta de dueño' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar tokens usando el refresh token',
    description:
      'Retorna un nuevo par accessToken + refreshToken (rotación). El refresh token anterior queda invalidado.',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión e invalidar el refresh token' })
  logout(@CurrentUser('sub') usuarioId: string) {
    return this.authService.logout(usuarioId);
  }

  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Iniciar sesión con Google',
    description:
      'Redirige a la pantalla de autenticación de Google. Al completar, retorna accessToken + refreshToken.',
  })
  googleAuth() {
    // El guard de Passport redirige automáticamente a Google
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Callback de Google OAuth — redirige a la app Android' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const googleUser = req.user as {
      email: string;
      nombre: string;
      apellidoPaterno: string;
      fotoPerfilUrl?: string;
    };
    const result = await this.authService.findOrCreateGoogleUser(googleUser);

    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      userId: result.usuario.usuarioId,
      rol: result.usuario.rol,
      nombre: result.usuario.nombre,
    });
    return res.redirect(`petfinder://auth/callback?${params.toString()}`);
  }
}
