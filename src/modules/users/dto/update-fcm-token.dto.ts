import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFcmTokenDto {
  @ApiProperty({ example: 'dS1xF3p_...FCM_TOKEN_AQUI' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  tokenFcm!: string;
}
