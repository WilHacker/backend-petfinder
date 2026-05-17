import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ScanQrDto } from './dto/scan-qr.dto';
import { QrService } from './qr.service';

@ApiTags('QR')
@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get(':token')
  @Public()
  @ApiOperation({
    summary: 'Perfil público de la mascota por token QR',
    description:
      'Devuelve el perfil completo: datos básicos, ficha médica, registros médicos y ' +
      'contactos de los dueños. Incluye el flag estaExtraviada para mostrar el banner. ' +
      'No requiere autenticación — es el endpoint que llama el frontend al escanear el QR.',
  })
  getPetByToken(@Param('token') token: string) {
    return this.qrService.getPetByToken(token);
  }

  @Post(':token/scan')
  @Public()
  @ApiOperation({
    summary: 'Registrar escaneo del QR con ubicación GPS',
    description:
      'Guarda el evento de escaneo. Si se incluyen lat/lng (opcionales — el usuario puede ' +
      'negar el permiso GPS), notifica al dueño con la ubicación exacta via push notification.',
  })
  registerScan(@Param('token') token: string, @Body() dto: ScanQrDto) {
    return this.qrService.registerScan(token, dto.lat, dto.lng);
  }
}
