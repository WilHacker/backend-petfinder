import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateSightingDto {
  @ApiProperty({ example: -17.3935, description: 'Latitud del avistamiento' })
  @Transform(({ value }) => parseFloat(value as string))
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: -66.157, description: 'Longitud del avistamiento' })
  @Transform(({ value }) => parseFloat(value as string))
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ example: 'Lo vi cerca del mercado central, estaba asustado' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensajeRescatista?: string;
}
