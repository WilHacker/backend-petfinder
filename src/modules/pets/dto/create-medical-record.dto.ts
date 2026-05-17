import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMedicalRecordDto {
  @ApiProperty({
    example: 'vacuna',
    description:
      'Tipo de registro: vacuna | consulta | cirugia | tratamiento | desparasitacion | otro',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tipo!: string;

  @ApiProperty({ example: 'Vacuna antirrábica anual' })
  @IsString()
  @IsNotEmpty()
  descripcion!: string;

  @ApiPropertyOptional({ example: '2025-03-15' })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional({ example: 'Dr. Rodríguez — Clínica Animalitos' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  veterinario?: string;
}
