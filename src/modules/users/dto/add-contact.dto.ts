import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TipoContacto } from '@prisma/client';

export class AddContactDto {
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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'El campo esPrincipal debe ser verdadero o falso' })
  esPrincipal?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Marcar como contacto de emergencia' })
  @IsOptional()
  @IsBoolean({ message: 'El campo esEmergencia debe ser verdadero o falso' })
  esEmergencia?: boolean;
}
