import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMedicalRecordDto {
  @ApiPropertyOptional({ example: 'consulta' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo?: string;

  @ApiPropertyOptional({ example: 'Consulta de control post-vacuna' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ example: '2026-05-20' })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional({ example: 'Dr. Rodríguez — Clínica Animalitos' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  veterinario?: string;
}
