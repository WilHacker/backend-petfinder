import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRatingDto {
  @ApiProperty({
    example: '76a6e9ff-a9df-44f7-ad82-01a039c4a724',
    description: 'UUID del comentarista que se está calificando',
  })
  @IsUUID()
  rescatistaUsuarioId!: string;

  @ApiProperty({ example: 5, description: 'Puntuación 1–5 estrellas' })
  @IsInt()
  @Min(1)
  @Max(5)
  estrellas!: number;

  @ApiPropertyOptional({
    example: 'Fue muy preciso, nos ayudó a encontrarlo rápido',
    description: 'Comentario opcional del dueño sobre la ayuda recibida',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  mensaje?: string;
}
