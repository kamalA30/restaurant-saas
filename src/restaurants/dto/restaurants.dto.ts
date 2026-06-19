import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination/pagination.dto';

export class CreateRestaurantDto {
  @ApiProperty({ example: 'Beirut Kitchen' })
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'DE' })
  @IsString()
  country: string;

  @ApiProperty({ example: 'Berlin' })
  @IsString()
  city: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  logoUrl?: string;
}

export class UpdateRestaurantDto extends PartialType(CreateRestaurantDto) {}

export class CreateBranchDto {
  @ApiProperty() @IsUUID() restaurantId: string;
  @ApiProperty({ example: 'Mitte Branch' }) @IsString() @MinLength(2) name: string;
  @ApiProperty({ example: 'Unter den Linden 1, 10117 Berlin' }) @IsString() address: string;
  @ApiProperty({ example: 'Berlin' }) @IsString() city: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

// ── 🛠️ تم تعديل هذا الكلاس بإضافة الحقل المطلوب ──
export class RestaurantsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by Restaurant ID (For Super Admin)' }) 
  @IsOptional() 
  @IsUUID() // للتأكد من أن المعرّف الممرر هو UUID سليم
  restaurantId?: string; // 👈 إضافة علامة الاستفهام تجعله اختيارياً

  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}