import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdatePetStatusDto {
  @ApiProperty({
    enum: ['en_casa', 'en_paseo', 'extraviada', 'recuperada'],
    example: 'en_paseo',
  })
  @IsIn(['en_casa', 'en_paseo', 'extraviada', 'recuperada'])
  estado!: string;
}
