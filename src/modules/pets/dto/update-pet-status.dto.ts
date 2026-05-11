import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EstadoMascota } from '@prisma/client';

export class UpdatePetStatusDto {
  @ApiProperty({
    enum: EstadoMascota,
    example: EstadoMascota.en_paseo,
    description: 'en_casa | en_paseo | extraviada | recuperada',
  })
  @IsEnum(EstadoMascota, {
    message: 'El estado debe ser uno de: en_casa, en_paseo, extraviada, recuperada',
  })
  estado!: EstadoMascota;
}
