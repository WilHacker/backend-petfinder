import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RelacionPropietario } from '@prisma/client';

export class AddOwnerDto {
  @ApiProperty({ example: 'uuid-de-la-persona' })
  @IsUUID()
  personaId!: string;

  @ApiPropertyOptional({ enum: RelacionPropietario, default: RelacionPropietario.Dueno_Principal })
  @IsOptional()
  @IsEnum(RelacionPropietario)
  tipoRelacion?: RelacionPropietario;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  recibeAlertas?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  mostrarEnQr?: boolean;
}
