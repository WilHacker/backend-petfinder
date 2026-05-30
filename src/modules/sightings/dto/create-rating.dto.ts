import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class CreateRatingDto {
  @ApiProperty({ example: true, description: 'El avistamiento fue verídico y útil' })
  @IsBoolean()
  confirmado!: boolean;

  @ApiProperty({ example: 5, description: 'Puntuación al rescatista (1–5 estrellas)' })
  @IsInt()
  @Min(1)
  @Max(5)
  estrellas!: number;
}
