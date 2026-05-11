import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RelacionPropietario } from '@prisma/client';

export class AddOwnerDto {
  @ApiProperty({ example: 'uuid-de-la-persona' })
  @IsUUID('4', { message: 'El ID de la persona debe ser un UUID v4 válido' })
  personaId!: string;

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
