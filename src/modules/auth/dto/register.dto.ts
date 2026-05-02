import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoContacto } from '@prisma/client';

class MedioContactoDto {
  @ApiProperty({ enum: TipoContacto })
  @IsEnum(TipoContacto)
  tipo!: TipoContacto;

  @ApiProperty({ example: '+591 70000000' })
  @IsString()
  @IsNotEmpty()
  valor!: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  apellidoPaterno!: string;

  @ApiPropertyOptional({ example: 'López' })
  @IsOptional()
  @IsString()
  apellidoMaterno?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  ci?: string;

  @ApiProperty({ example: 'juan@email.com' })
  @IsEmail()
  correoElectronico!: string;

  @ApiProperty({ example: 'secreto123', minLength: 6 })
  @IsString()
  @MinLength(6)
  clave!: string;

  @ApiPropertyOptional({ type: MedioContactoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MedioContactoDto)
  medioContacto?: MedioContactoDto;
}
