import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsDecimal, IsInt, IsNumber,
  IsOptional, IsString, IsUUID, MaxLength, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/pagination/pagination.dto';

// ── Categories DTOs ────────────────────────────

export class CreateCategoryDto {
  // 🛡️ تعديل حاسم: جعلناه @IsOptional لأن المالك ومدير الفرع سيتم حقن المطعم لهما تلقائياً من التوكن، والسوبر أدمن فقط من يرسله صراحة
  @ApiPropertyOptional({ description: 'The restaurant ID. Optional for Owners/Managers (extracted from JWT token).' }) 
  @IsOptional() 
  @IsUUID() 
  restaurantId?: string;

  // 🛡️ إضافة حاسمة: جعلنا الـ branchId اختيارياً لكي يتمكن المالك من إنشاء تصنيف عام، بينما يستخدمه مدير الفرع لتقييد التصنيف لفرعه فقط
  @ApiPropertyOptional({ description: 'Optional: to lock this category to a specific branch' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 'Starters', description: 'Name of the category' }) 
  @IsString() 
  @MinLength(2) 
  @MaxLength(80) 
  name: string;

  @ApiPropertyOptional({ example: 'Delicious hot and cold appetizers' }) 
  @IsOptional() 
  @IsString() 
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/images/starters.jpg' }) 
  @IsOptional() 
  @IsString() 
  imageUrl?: string;

  @ApiPropertyOptional({ default: 0, example: 1 }) 
  @IsOptional() 
  @IsInt() 
  @Min(0) 
  sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

// ── Menu Items DTOs ────────────────────────────

export class CreateMenuItemDto {
  @ApiProperty({ description: 'The category ID this item belongs to' }) 
  @IsUUID() 
  categoryId: string;

  @ApiProperty({ example: 'Hummus Plate' }) 
  @IsString() 
  @MinLength(2) 
  @MaxLength(120) 
  name: string;

  @ApiPropertyOptional({ example: 'Traditional blended chickpeas with tahini and olive oil' }) 
  @IsOptional() 
  @IsString() 
  description?: string;

  @ApiProperty({ example: 8.5, description: 'The baseline price across all branches' }) 
  @IsNumber() 
  @Min(0) 
  basePrice: number;

  @ApiPropertyOptional({ example: 'https://example.com/images/hummus.jpg' }) 
  @IsOptional() 
  @IsString() 
  imageUrl?: string;

  @ApiPropertyOptional({ default: 10, example: 7 }) 
  @IsOptional() 
  @IsInt() 
  @Min(1) 
  preparationTimeMinutes?: number;

  @ApiPropertyOptional({ example: 350 }) 
  @IsOptional() 
  @IsInt() 
  calories?: number;

  @ApiPropertyOptional({ type: [String], example: ['Sesame'] }) 
  @IsOptional() 
  @IsArray() 
  @IsString({ each: true }) 
  allergens?: string[];
}

export class UpdateMenuItemDto extends PartialType(CreateMenuItemDto) {}

// ── Branch Overrides DTOs ──────────────────────

export class BranchMenuOverrideDto {
  @ApiProperty({ description: 'The specific branch enforcing the override' }) 
  @IsUUID() 
  branchId: string;

  @ApiProperty({ description: 'The target menu item ID' }) 
  @IsUUID() 
  menuItemId: string;

  @ApiPropertyOptional({ example: 9.99, description: 'Branch-specific localized price' }) 
  @IsOptional() 
  @IsNumber() 
  @Min(0) 
  price?: number;

  @ApiPropertyOptional({ example: false, description: 'Branch-specific availability toggle' }) 
  @IsOptional() 
  @IsBoolean() 
  isAvailable?: boolean;
}

// ── Query DTOs ─────────────────────────────────

export class MenuQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() restaurantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAvailable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
}