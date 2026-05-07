import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreatePetDto {
  @ApiProperty({ example: 'Firulais' })
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del tipo de mascota' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tipoId?: number;

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

  @ApiPropertyOptional({
    example: 0,
    description: 'Índice 0-based de la foto principal (multipart)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fotoPrincipalIndex?: number;
}
