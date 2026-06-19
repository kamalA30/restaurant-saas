import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum AnalyticsPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
  CUSTOM = 'custom',
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: AnalyticsPeriod, default: AnalyticsPeriod.WEEK })
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod = AnalyticsPeriod.WEEK;

  @ApiPropertyOptional({ description: 'Required when period=custom' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Required when period=custom' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

// ── Response shapes (for Swagger & AI Agent) ──

export class DateRangeDto {
  from: Date;
  to: Date;
}

export class RevenueDataPointDto {
  date: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

export class TopItemDto {
  rank: number;
  menuItemId: string;
  name: string;
  category: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

export class BranchSalesDto {
  branchId: string;
  branchName: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  completedOrders: number;
  cancelledOrders: number;
  cancellationRate: number;
}

export class PeakHourDto {
  hour: number;          // 0–23
  label: string;         // "14:00"
  orderCount: number;
  revenue: number;
}

export class LowPerformerDto {
  menuItemId: string;
  name: string;
  category: string;
  totalQuantity: number;
  totalRevenue: number;
  daysWithZeroSales: number;
}

export class OrderStatsSummaryDto {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  avgPreparationTimeMinutes: number;
}
