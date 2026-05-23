import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsOptional } from 'class-validator';
import { RelacionPropietario } from '@prisma/client';

export class AddOwnerDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail({}, { message: 'Debe ser un correo electrónico válido' })
  correoElectronico!: string;

  @ApiPropertyOptional({ enum: RelacionPropietario })
  @IsOptional()
  @IsEnum(RelacionPropietario, {
    message: 'La relación debe ser: Dueño Principal, Familiar o Cuidador',
  })
  tipoRelacion?: RelacionPropietario;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'El campo recibeAlertas debe ser verdadero o falso' })
  recibeAlertas?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'El campo mostrarEnQr debe ser verdadero o falso' })
  mostrarEnQr?: boolean;
}
