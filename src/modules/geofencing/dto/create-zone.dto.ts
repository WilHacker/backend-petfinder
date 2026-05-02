import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

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
  coordenadas?: CoordDto[];
}
