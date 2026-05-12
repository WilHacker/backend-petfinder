import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdatePetLocationDto {
  @ApiProperty({ example: -17.397, description: 'Latitud decimal (-90 a 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: -66.149, description: 'Longitud decimal (-180 a 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
