import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TipoContacto } from '@prisma/client';

export class AddContactDto {
  @ApiProperty({ enum: TipoContacto })
  @IsEnum(TipoContacto)
  tipo!: TipoContacto;

  @ApiProperty({ example: '+591 70000000' })
  @IsString()
  @IsNotEmpty()
  valor!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  esPrincipal?: boolean;
}
