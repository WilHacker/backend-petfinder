import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateLocationDto {
  @ApiProperty({ example: -17.7863, description: 'Latitud (-90 a 90)' })
  @IsNumber({}, { message: 'La latitud debe ser un número' })
  @Min(-90, { message: 'La latitud mínima permitida es -90' })
  @Max(90, { message: 'La latitud máxima permitida es 90' })
  lat!: number;

  @ApiProperty({ example: -63.1812, description: 'Longitud (-180 a 180)' })
  @IsNumber({}, { message: 'La longitud debe ser un número' })
  @Min(-180, { message: 'La longitud mínima permitida es -180' })
  @Max(180, { message: 'La longitud máxima permitida es 180' })
  lng!: number;
}
