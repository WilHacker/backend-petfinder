import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CoordDto {
  @ApiProperty({ example: -17.7863 })
  @IsNumber()
  lat!: number;

  @ApiProperty({ example: -63.1812 })
  @IsNumber()
  lng!: number;
}

export class CreateZoneDto {
  @ApiProperty({ example: 'Casa' })
  @IsString()
  @IsNotEmpty()
  nombreZona!: string;

  @ApiProperty({ enum: ['circulo', 'poligono'], example: 'circulo' })
  @IsIn(['circulo', 'poligono'])
  tipo!: 'circulo' | 'poligono';

  @ApiPropertyOptional({ example: -17.7863, description: 'Requerido si tipo=circulo' })
  @ValidateIf((o) => o.tipo === 'circulo')
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: -63.1812, description: 'Requerido si tipo=circulo' })
  @ValidateIf((o) => o.tipo === 'circulo')
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ example: 200, description: 'Radio en metros. Requerido si tipo=circulo' })
  @ValidateIf((o) => o.tipo === 'circulo')
  @IsNumber()
  @Min(10)
  radioMetros?: number;

  @ApiPropertyOptional({
    type: [CoordDto],
    description: 'Array de coordenadas del polígono. Requerido si tipo=poligono (mínimo 3 puntos)',
  })
  @ValidateIf((o) => o.tipo === 'poligono')
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => CoordDto)
  coordenadas?: CoordDto[];

  @ApiPropertyOptional({
    type: [String],
    example: ['uuid-mascota-2', 'uuid-mascota-3'],
    description: 'IDs adicionales de mascotas a asociar a esta zona (el dueño puede agregar más)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mascotaIds?: string[];
}
