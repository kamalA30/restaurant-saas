import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AiQueryDto {
  @ApiProperty({ example: 'أي فرع حقق أعلى مبيعات هذا الأسبوع؟', description: 'سؤال المستخدم باللغة الطبيعية' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  message: string;
}