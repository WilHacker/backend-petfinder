import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateCommentDto {
  @ApiPropertyOptional({ example: 'Lo vi cerca del parque central, estaba solo y asustado' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensaje?: string;

  @ApiPropertyOptional({
    example: -17.3935,
    description: 'Latitud (solo se guarda si se adjunta foto)',
  })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value as string))
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    example: -66.157,
    description: 'Longitud (solo se guarda si se adjunta foto)',
  })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value as string))
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    example: '145b307f-1d35-4ff6-9557-85070e8c6ddc',
    description:
      'UUID del usuario al que va dirigido este comentario (respuesta privada del dueño a un comentarista)',
  })
  @IsOptional()
  @IsUUID()
  replyToUserId?: string;
}
