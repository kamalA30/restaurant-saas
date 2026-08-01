import { Controller, Get, Query, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator'; // 👈 استيراد ديكوراتور المستخدم الحالي

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Order stats summary (totals, revenue, avg order, prep time)' })
  getOrderStats(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    return this.analyticsService.getOrderStats(query, user);
  }

  @Get('top-items')
  @ApiOperation({ summary: 'Top-selling menu items by revenue' })
  getTopItems(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    return this.analyticsService.getTopSellingItems(query, user);
  }

  @Get('branch-sales')
  @ApiOperation({ summary: 'Sales comparison across branches' })
  getBranchSales(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    // 🛡️ حظر فوري: مدير الفرع لا يجوز له مقارنة مبيعات الفروع الأخرى
    if (user.role === Role.BRANCH_MANAGER) {
      throw new ForbiddenException('Access denied: Branch managers cannot access multi-branch sales comparison');
    }
    return this.analyticsService.getBranchSales(query, user);
  }

  @Get('revenue-trend')
  @ApiOperation({ summary: 'Daily revenue trend over selected period' })
  getRevenueTrend(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    return this.analyticsService.getRevenueTrend(query, user);
  }

  @Get('peak-hours')
  @ApiOperation({ summary: 'Peak order hours (busiest times of day)' })
  getPeakHours(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    return this.analyticsService.getPeakHours(query, user);
  }

  @Get('low-performers')
  @ApiOperation({ summary: 'Low-performing menu items (candidates for removal)' })
  getLowPerformers(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    return this.analyticsService.getLowPerformers(query, user);
  }

  @Get('snapshot')
  @ApiOperation({
    summary: 'Full analytics snapshot — primary data source for the AI Dashboard Agent',
  })
  getFullSnapshot(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    return this.analyticsService.getFullSnapshot(query, user);
  }
}
