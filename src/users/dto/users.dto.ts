import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination/pagination.dto';

export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(2) firstName: string;
  @ApiProperty() @IsString() @MinLength(2) lastName: string;
  @ApiProperty() @IsString() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role: Role;
  
  // 🛡️ حاسم جداً: علامة الاستفهام و @IsOptional تجعله اختيارياً للمالك وإجبارياً للسوبر أدمن في السيرفيس
  @ApiPropertyOptional() @IsOptional() @IsUUID() restaurantId?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class AssignBranchDto {
  @ApiProperty() @IsUUID() branchId: string;
  @ApiProperty() @IsUUID() userId: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role: Role;
}

export class UsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() restaurantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
}