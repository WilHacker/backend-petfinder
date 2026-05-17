import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token recibido en el login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
