import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'juan@email.com' })
  @IsEmail({}, { message: 'Debe ser un correo electrónico válido' })
  @MaxLength(255, { message: 'El correo no puede exceder 255 caracteres' })
  correoElectronico!: string;

  @ApiProperty({ example: 'secreto123' })
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(100, { message: 'La contraseña no puede exceder 100 caracteres' })
  clave!: string;
}
