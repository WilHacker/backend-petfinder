import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío si se proporciona' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  nombre?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString({ message: 'El apellido paterno debe ser texto' })
  @IsNotEmpty({ message: 'El apellido paterno no puede estar vacío si se proporciona' })
  @MaxLength(100, { message: 'El apellido paterno no puede exceder 100 caracteres' })
  apellidoPaterno?: string;

  @ApiPropertyOptional({ example: 'López' })
  @IsOptional()
  @IsString({ message: 'El apellido materno debe ser texto' })
  @IsNotEmpty({ message: 'El apellido materno no puede estar vacío si se proporciona' })
  @MaxLength(100, { message: 'El apellido materno no puede exceder 100 caracteres' })
  apellidoMaterno?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString({ message: 'El CI debe ser texto' })
  @IsNotEmpty({ message: 'El CI no puede estar vacío si se proporciona' })
  @MaxLength(20, { message: 'El CI no puede exceder 20 caracteres' })
  ci?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de nacimiento debe tener formato YYYY-MM-DD' })
  fechaNacimiento?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/foto.jpg' })
  @IsOptional()
  @IsUrl({}, { message: 'La foto de perfil debe ser una URL válida' })
  fotoPerfilUrl?: string;
}
