import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateRewardDto {
  @ApiProperty({
    example: 200,
    description: 'Monto de recompensa en bolivianos (0 = sin recompensa)',
  })
  @IsNumber()
  @Min(0)
  recompensa!: number;
}
