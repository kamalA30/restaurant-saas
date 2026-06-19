import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID,
  Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/pagination/pagination.dto';

export class OrderItemDto {
  @ApiProperty() @IsUUID() menuItemId: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateOrderDto {
  @ApiProperty() @IsUUID() branchId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tableNumber?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class OrdersQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() cashierId?: string;
}
