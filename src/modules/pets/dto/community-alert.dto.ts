import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CommunityAlertDto {
  @ApiPropertyOptional({
    example: 5000,
    description: 'Radio de búsqueda en metros (100 – 50 000). Default 5000.',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El radio debe ser un número' })
  @Min(100, { message: 'El radio mínimo es 100 metros' })
  @Max(50000, { message: 'El radio máximo es 50 000 metros' })
  radio?: number;
}
