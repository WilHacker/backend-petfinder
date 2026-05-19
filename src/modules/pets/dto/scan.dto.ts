import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ScanDto {
  @ApiPropertyOptional({
    example: -17.3935,
    description: 'Latitud del escáner (si compartió ubicación)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    example: -66.157,
    description: 'Longitud del escáner (si compartió ubicación)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}
