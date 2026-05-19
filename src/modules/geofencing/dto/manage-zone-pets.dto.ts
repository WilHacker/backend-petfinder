import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ManageZonePetsDto {
  @ApiProperty({
    type: [String],
    example: ['uuid-mascota-1', 'uuid-mascota-2'],
    description: 'Lista de mascotaIds (mínimo 1)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  mascotaIds!: string[];
}
