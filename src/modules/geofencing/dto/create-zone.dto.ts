import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CoordDto {
  @ApiProperty({ example: -17.7863 })
  @IsNumber({}, { message: 'La latitud de la coordenada debe ser un número' })
  @Min(-90, { message: 'La latitud mínima es -90' })
  @Max(90, { message: 'La latitud máxima es 90' })
  lat!: number;

  @ApiProperty({ example: -63.1812 })
  @IsNumber({}, { message: 'La longitud de la coordenada debe ser un número' })
  @Min(-180, { message: 'La longitud mínima es -180' })
  @Max(180, { message: 'La longitud máxima es 180' })
  lng!: number;
}

export class CreateZoneDto {
  @ApiProperty({ example: 'Casa' })
  @IsString({ message: 'El nombre de la zona debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de la zona es obligatorio' })
  @MaxLength(100, { message: 'El nombre de la zona no puede exceder 100 caracteres' })
  nombreZona!: string;

  @ApiProperty({ enum: ['circulo', 'poligono'], example: 'circulo' })
  @IsIn(['circulo', 'poligono'], { message: 'El tipo de zona debe ser circulo o poligono' })
  tipo!: 'circulo' | 'poligono';

  @ApiPropertyOptional({ example: -17.7863, description: 'Requerido si tipo=circulo' })
  @ValidateIf((o) => o.tipo === 'circulo')
  @IsNumber({}, { message: 'La latitud del centro debe ser un número' })
  @Min(-90, { message: 'La latitud mínima es -90' })
  @Max(90, { message: 'La latitud máxima es 90' })
  lat?: number;

  @ApiPropertyOptional({ example: -63.1812, description: 'Requerido si tipo=circulo' })
  @ValidateIf((o) => o.tipo === 'circulo')
  @IsNumber({}, { message: 'La longitud del centro debe ser un número' })
  @Min(-180, { message: 'La longitud mínima es -180' })
  @Max(180, { message: 'La longitud máxima es 180' })
  lng?: number;

  @ApiPropertyOptional({
    example: 200,
    description: 'Radio en metros (10 – 50 000). Requerido si tipo=circulo',
  })
  @ValidateIf((o) => o.tipo === 'circulo')
  @IsNumber({}, { message: 'El radio debe ser un número' })
  @Min(10, { message: 'El radio mínimo permitido es 10 metros' })
  @Max(50000, { message: 'El radio máximo permitido es 50 000 metros' })
  radioMetros?: number;

  @ApiPropertyOptional({
    type: [CoordDto],
    description: 'Array de coordenadas del polígono (3 – 100 puntos). Requerido si tipo=poligono',
  })
  @ValidateIf((o) => o.tipo === 'poligono')
  @IsArray({ message: 'Las coordenadas deben ser un arreglo' })
  @ArrayMinSize(3, { message: 'El polígono debe tener al menos 3 coordenadas' })
  @ArrayMaxSize(100, { message: 'El polígono no puede tener más de 100 coordenadas' })
  @ValidateNested({ each: true })
  @Type(() => CoordDto)
  coordenadas?: CoordDto[];

  @ApiPropertyOptional({
    type: [String],
    example: ['uuid-mascota-2'],
    description: 'IDs adicionales de mascotas a asociar (máx. 20)',
  })
  @IsOptional()
  @IsArray({ message: 'Los IDs de mascotas deben ser un arreglo' })
  @ArrayMaxSize(20, { message: 'No se pueden asociar más de 20 mascotas a la vez' })
  @IsUUID('4', { each: true, message: 'Cada ID de mascota debe ser un UUID v4 válido' })
  mascotaIds?: string[];
}
