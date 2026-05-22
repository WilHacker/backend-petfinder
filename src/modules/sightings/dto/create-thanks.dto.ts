import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateThanksDto {
  @ApiProperty({ example: '¡Muchas gracias por avisar! Ya lo encontramos gracias a ti.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  mensaje!: string;
}
