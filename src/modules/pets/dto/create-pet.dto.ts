import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePetDto {
  @ApiProperty({ example: 'Firulais' })
  @IsString({ message: 'El nombre de la mascota debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de la mascota es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  nombre!: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del tipo de mascota' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tipo de mascota debe ser un número entero' })
  tipoId?: number;

  @ApiPropertyOptional({ example: 'M', description: 'M o F' })
  @IsOptional()
  @IsIn(['M', 'F'], { message: 'El sexo debe ser M (macho) o F (hembra)' })
  sexo?: string;

  @ApiPropertyOptional({ example: 'Café' })
  @IsOptional()
  @IsString({ message: 'El color debe ser texto' })
  @IsNotEmpty({ message: 'El color no puede estar vacío si se proporciona' })
  @MaxLength(50, { message: 'El color no puede exceder 50 caracteres' })
  colorPrimario?: string;

  @ApiPropertyOptional({ example: 'Mancha blanca en la pata derecha' })
  @IsOptional()
  @IsString({ message: 'Los rasgos particulares deben ser texto' })
  @IsNotEmpty({ message: 'Los rasgos no pueden estar vacíos si se proporcionan' })
  rasgosParticulares?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Índice 0-based de la foto principal (máx. 3 para 4 fotos)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El índice de foto principal debe ser un número entero' })
  @Min(0, { message: 'El índice de foto principal no puede ser negativo' })
  @Max(3, { message: 'El índice de foto principal no puede ser mayor a 3' })
  fotoPrincipalIndex?: number;
}
