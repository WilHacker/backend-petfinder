import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'juan@email.com' })
  @IsEmail()
  correoElectronico!: string;

  @ApiProperty({ example: 'secreto123' })
  @IsString()
  @MinLength(6)
  clave!: string;
}
