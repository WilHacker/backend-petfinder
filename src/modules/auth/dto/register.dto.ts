import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoContacto } from '@prisma/client';

class MedioContactoDto {
  @ApiProperty({ enum: TipoContacto })
  @IsEnum(TipoContacto, {
    message: 'El tipo de contacto no es válido. Use: WhatsApp, Celular, Fijo o Telegram',
  })
  tipo!: TipoContacto;

  @ApiProperty({ example: '+591 70000000' })
  @IsString({ message: 'El valor del contacto debe ser texto' })
  @IsNotEmpty({ message: 'El valor del contacto es obligatorio' })
  @MaxLength(50, { message: 'El valor del contacto no puede exceder 50 caracteres' })
  valor!: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'Juan' })
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  nombre!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString({ message: 'El apellido paterno debe ser texto' })
  @IsNotEmpty({ message: 'El apellido paterno es obligatorio' })
  @MaxLength(100, { message: 'El apellido paterno no puede exceder 100 caracteres' })
  apellidoPaterno!: string;

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

  @ApiProperty({ example: 'juan@email.com' })
  @IsEmail({}, { message: 'Debe ser un correo electrónico válido' })
  @MaxLength(255, { message: 'El correo no puede exceder 255 caracteres' })
  correoElectronico!: string;

  @ApiProperty({ example: 'secreto123', minLength: 6 })
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(100, { message: 'La contraseña no puede exceder 100 caracteres' })
  clave!: string;

  @ApiPropertyOptional({ type: MedioContactoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MedioContactoDto)
  medioContacto?: MedioContactoDto;
}
