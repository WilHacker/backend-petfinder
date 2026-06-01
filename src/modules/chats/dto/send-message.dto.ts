import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SendMessageDto {
  @ApiPropertyOptional({ example: 'Hola, ¿aún tienes a mi mascota?' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  contenido?: string;

  @ApiPropertyOptional({ example: -17.39 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Transform(({ value }: { value: unknown }) =>
    value != null ? parseFloat(value as string) : undefined,
  )
  lat?: number;

  @ApiPropertyOptional({ example: -66.15 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Transform(({ value }: { value: unknown }) =>
    value != null ? parseFloat(value as string) : undefined,
  )
  lng?: number;
}
