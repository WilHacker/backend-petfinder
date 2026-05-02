import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePetDto {
  @ApiProperty({ example: 'Firulais' })
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @ApiPropertyOptional({ example: 1, description: 'ID de la raza' })
  @IsOptional()
  @IsInt()
  razaId?: number;

  @ApiPropertyOptional({ example: 'M', description: 'M o F' })
  @IsOptional()
  @IsString()
  @IsIn(['M', 'F'])
  sexo?: string;

  @ApiPropertyOptional({ example: 'Café' })
  @IsOptional()
  @IsString()
  colorPrimario?: string;

  @ApiPropertyOptional({ example: 'Mancha blanca en la pata derecha' })
  @IsOptional()
  @IsString()
  rasgosParticulares?: string;
}
