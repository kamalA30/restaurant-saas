import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AiQueryDto {
  @ApiProperty({ 
    example: 'Which branch achieved the highest sales this week?', 
    description: 'Natural language query submitted by the user' 
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  message: string;
}
