import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Lo vi cerca del parque central, estaba solo y asustado' })
  @IsString()
  @MaxLength(500)
  mensaje!: string;

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
}
