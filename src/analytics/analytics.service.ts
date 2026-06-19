import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalyticsQueryDto,
  AnalyticsPeriod,
  DateRangeDto,
  TopItemDto,
  BranchSalesDto,
  RevenueDataPointDto,
  PeakHourDto,
  LowPerformerDto,
  OrderStatsSummaryDto,
} from './dto/analytics.dto';
import { OrderStatus, Role } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────
  // 🛡️ جدار الحماية المركزي وعزل البيانات (Security Boundary Guard)
  // ─────────────────────────────────────────
  private async enforceSecurityBoundaries(query: AnalyticsQueryDto, currentUser: any): Promise<void> {
    if (currentUser.role === Role.SUPER_ADMIN) return; // الـ Super Admin يتخطى الفحص

    // 1. عزل وإلزام الـ OWNER بمطعمه فقط حتماً
    if (currentUser.role === Role.OWNER) {
      query.restaurantId = currentUser.restaurantId; // إجبار التقييد على مطعمه ومحو أي مدخل آخر
      
      if (query.branchId) {
        const belongsToOwner = await this.prisma.branch.findFirst({
          where: { id: query.branchId, restaurantId: currentUser.restaurantId },
        });
        if (!belongsToOwner) {
          throw new ForbiddenException('Access denied: The requested branch does not belong to your restaurant');
        }
      }
    }

    if (currentUser.role === Role.BRANCH_MANAGER) {
      query.branchId = currentUser.branchId;
      query.restaurantId = currentUser.restaurantId;
    }
  }

  // ─────────────────────────────────────────
  // UTIL: resolve date range from period
  // ─────────────────────────────────────────
  resolveDateRange(query: AnalyticsQueryDto): DateRangeDto {
    const now = new Date();
    const to = new Date(now);
    let from = new Date(now);

    switch (query.period) {
      case AnalyticsPeriod.TODAY:
        from.setHours(0, 0, 0, 0);
        break;
      case AnalyticsPeriod.WEEK:
        from.setDate(now.getDate() - 7);
        break;
      case AnalyticsPeriod.MONTH:
        from.setMonth(now.getMonth() - 1);
        break;
      case AnalyticsPeriod.QUARTER:
        from.setMonth(now.getMonth() - 3);
        break;
      case AnalyticsPeriod.YEAR:
        from.setFullYear(now.getFullYear() - 1);
        break;
      case AnalyticsPeriod.CUSTOM:
        from = new Date(query.dateFrom!);
        return { from, to: new Date(query.dateTo!) };
    }

    return { from, to };
  }

  private buildOrderWhere(query: AnalyticsQueryDto, range: DateRangeDto): any {
    const where: any = {
      status: OrderStatus.COMPLETED,
      createdAt: { gte: range.from, lte: range.to },
    };
    if (query.branchId) where.branchId = query.branchId;
    if (query.restaurantId) where.branch = { restaurantId: query.restaurantId };
    return where;
  }

  // ─────────────────────────────────────────
  // 1. ORDER STATS SUMMARY
  // ─────────────────────────────────────────
  async getOrderStats(query: AnalyticsQueryDto, currentUser: any): Promise<OrderStatsSummaryDto> {
    await this.enforceSecurityBoundaries(query, currentUser);
    const range = this.resolveDateRange(query);
    
    const baseWhere: any = {
      createdAt: { gte: range.from, lte: range.to },
    };
    if (query.branchId) baseWhere.branchId = query.branchId;
    if (query.restaurantId) baseWhere.branch = { restaurantId: query.restaurantId };

    const [allOrders, completedOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: baseWhere,
        select: { status: true, total: true, completedAt: true, preparingAt: true },
      }),
      this.prisma.order.findMany({
        where: { ...baseWhere, status: OrderStatus.COMPLETED },
        select: { total: true, completedAt: true, preparingAt: true },
      }),
    ]);

    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalOrders = allOrders.length;
    const completed = completedOrders.length;
    const cancelled = allOrders.filter((o) => o.status === OrderStatus.CANCELLED).length;
    const pending = allOrders.filter(
      (o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.PREPARING,
    ).length;

    const prepTimes = completedOrders
      .filter((o) => o.preparingAt && o.completedAt)
      .map((o) => (o.completedAt!.getTime() - o.preparingAt!.getTime()) / 60000);
    const avgPrep = prepTimes.length ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : 0;

    return {
      totalOrders,
      completedOrders: completed,
      cancelledOrders: cancelled,
      pendingOrders: pending,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgOrderValue: completed > 0 ? Math.round((totalRevenue / completed) * 100) / 100 : 0,
      avgPreparationTimeMinutes: Math.round(avgPrep * 10) / 10,
    };
  }

  // ─────────────────────────────────────────
  // 2. TOP-SELLING ITEMS
  // ─────────────────────────────────────────
  async getTopSellingItems(query: AnalyticsQueryDto, currentUser: any): Promise<TopItemDto[]> {
    await this.enforceSecurityBoundaries(query, currentUser);
    const range = this.resolveDateRange(query);
    const orderWhere = this.buildOrderWhere(query, range);

    const result = await this.prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: { order: orderWhere },
      _sum: { quantity: true, totalPrice: true },
      _count: { orderId: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: query.limit ?? 10,
    });

    const itemIds = result.map((r) => r.menuItemId);
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: itemIds } },
      include: { category: { select: { name: true } } },
    });

    const itemMap = new Map(items.map((i) => [i.id, i]));

    return result.map((r, idx) => {
      const item = itemMap.get(r.menuItemId) as any;
      return {
        rank: idx + 1,
        menuItemId: r.menuItemId,
        name: item?.name ?? 'Unknown',
        category: item?.category?.name ?? 'Unknown',
        totalQuantity: r._sum.quantity ?? 0,
        totalRevenue: Math.round(Number(r._sum.totalPrice ?? 0) * 100) / 100,
        orderCount: r._count.orderId,
      };
    });
  }

  // ─────────────────────────────────────────
  // 3. BRANCH SALES COMPARISON
  // ─────────────────────────────────────────
  async getBranchSales(query: AnalyticsQueryDto, currentUser: any): Promise<BranchSalesDto[]> {
    await this.enforceSecurityBoundaries(query, currentUser);
    const range = this.resolveDateRange(query);
    
    const baseWhere: any = { createdAt: { gte: range.from, lte: range.to } };
    if (query.restaurantId) baseWhere.branch = { restaurantId: query.restaurantId };
    if (query.branchId) baseWhere.branchId = query.branchId;

    const branchGroups = await this.prisma.order.groupBy({
      by: ['branchId', 'status'],
      where: baseWhere,
      _sum: { total: true },
      _count: { id: true },
    });

    const branchIds = [...new Set(branchGroups.map((g) => g.branchId))];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    const branchData = new Map<string, BranchSalesDto>();
    for (const group of branchGroups) {
      if (!branchData.has(group.branchId)) {
        branchData.set(group.branchId, {
          branchId: group.branchId,
          branchName: (branchMap.get(group.branchId) as any)?.name ?? 'Unknown',
          totalRevenue: 0,
          totalOrders: 0,
          avgOrderValue: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          cancellationRate: 0,
        });
      }
      const entry = branchData.get(group.branchId) as any;
      entry.totalOrders += group._count.id;
      if (group.status === OrderStatus.COMPLETED) {
        entry.totalRevenue += Number(group._sum.total ?? 0);
        entry.completedOrders += group._count.id;
      }
      if (group.status === OrderStatus.CANCELLED) {
        entry.cancelledOrders += group._count.id;
      }
    }

    return Array.from(branchData.values()).map((b) => ({
      ...b,
      totalRevenue: Math.round(b.totalRevenue * 100) / 100,
      avgOrderValue: b.completedOrders > 0 ? Math.round((b.totalRevenue / b.completedOrders) * 100) / 100 : 0,
      cancellationRate: b.totalOrders > 0 ? Math.round((b.cancelledOrders / b.totalOrders) * 10000) / 100 : 0,
    }));
  }

  // ─────────────────────────────────────────
  // 4. WEEKLY / DAILY REVENUE TREND
  // ─────────────────────────────────────────
  async getRevenueTrend(query: AnalyticsQueryDto, currentUser: any): Promise<RevenueDataPointDto[]> {
    await this.enforceSecurityBoundaries(query, currentUser);
    const range = this.resolveDateRange(query);
    const orderWhere = this.buildOrderWhere(query, range);

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const byDate = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders) {
      const date = order.createdAt.toISOString().slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, { revenue: 0, orders: 0 });
      const entry = byDate.get(date)!;
      entry.revenue += Number(order.total);
      entry.orders += 1;
    }

    return Array.from(byDate.entries()).map(([date, data]) => ({
      date,
      revenue: Math.round(data.revenue * 100) / 100,
      orders: data.orders,
      avgOrderValue: data.orders > 0 ? Math.round((data.revenue / data.orders) * 100) / 100 : 0,
    }));
  }

  // ─────────────────────────────────────────
  // 5. PEAK HOURS
  // ─────────────────────────────────────────
  async getPeakHours(query: AnalyticsQueryDto, currentUser: any): Promise<PeakHourDto[]> {
    await this.enforceSecurityBoundaries(query, currentUser);
    const range = this.resolveDateRange(query);
    const orderWhere = this.buildOrderWhere(query, range);

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: { total: true, createdAt: true },
    });

    const byHour = new Array(24).fill(null).map((_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      orderCount: 0,
      revenue: 0,
    }));

    for (const order of orders) {
      const hour = order.createdAt.getHours();
      byHour[hour].orderCount += 1;
      byHour[hour].revenue += Number(order.total);
    }

    return byHour
      .map((h) => ({ ...h, revenue: Math.round(h.revenue * 100) / 100 }))
      .sort((a, b) => b.orderCount - a.orderCount);
  }

  // ─────────────────────────────────────────
  // 6. LOW-PERFORMING PRODUCTS
  // ─────────────────────────────────────────
  async getLowPerformers(query: AnalyticsQueryDto, currentUser: any): Promise<LowPerformerDto[]> {
    await this.enforceSecurityBoundaries(query, currentUser);
    const range = this.resolveDateRange(query);
    const orderWhere = this.buildOrderWhere(query, range);

    const allItems = await this.prisma.menuItem.findMany({
      where: {
        isActive: true,
        ...(query.restaurantId ? { category: { restaurantId: query.restaurantId } } : {}),
      },
      include: { category: { select: { name: true } } },
    });

    const salesData = await this.prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: { order: orderWhere },
      _sum: { quantity: true, totalPrice: true },
      _count: { orderId: true },
    });

    const salesMap = new Map(salesData.map((s) => [s.menuItemId, s]));
    const daysDiff = Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24));

    const performers = allItems.map((item) => {
      const sales = salesMap.get(item.id) as any;
      return {
        menuItemId: item.id,
        name: item.name,
        category: item.category.name,
        totalQuantity: sales?._sum.quantity ?? 0,
        totalRevenue: Math.round(Number(sales?._sum.totalPrice ?? 0) * 100) / 100,
        daysWithZeroSales: sales ? 0 : daysDiff,
      };
    });

    return performers.sort((a, b) => a.totalQuantity - b.totalQuantity).slice(0, query.limit ?? 10);
  }

  // ─────────────────────────────────────────
  // 7. FULL ANALYTICS SNAPSHOT (لصالح الـ AI Dashboard)
  // ─────────────────────────────────────────
  async getFullSnapshot(query: AnalyticsQueryDto, currentUser: any) {
    // نقوم أولاً بتطهير وتثبيت الصلاحيات للتأكد من تمرير كائنات آمنة لجميع الوعود المتوازية بالتعديل المباشر على المرجع query
    await this.enforceSecurityBoundaries(query, currentUser);

    const [stats, topItems, branchSales, revenueTrend, peakHours, lowPerformers] =
      await Promise.all([
        this.getOrderStats(query, currentUser),
        this.getTopSellingItems({ ...query, limit: 5 }, currentUser),
        // إذا كان مدير فرع، فلن يطلب الـ branchSales لأن الكنترولر سيحجبه، ولكن للاحتياط الأمني نمرر سياق فارغ إذا لزم الأمر
        currentUser.role === Role.BRANCH_MANAGER ? Promise.resolve([]) : this.getBranchSales(query, currentUser),
        this.getRevenueTrend(query, currentUser),
        this.getPeakHours(query, currentUser),
        this.getLowPerformers({ ...query, limit: 5 }, currentUser),
      ]);

    const range = this.resolveDateRange(query);

    return {
      meta: {
        period: query.period,
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
        generatedAt: new Date().toISOString(),
      },
      summary: stats,
      topItems,
      branchSales,
      revenueTrend,
      peakHours: peakHours.slice(0, 5),
      lowPerformers,
    };
  }

  // ─────────────────────────────────────────
  // 8. SNAPSHOT PERSISTENCE (Cron Job آمن ومحدد لفرع معيّن)
  // ─────────────────────────────────────────
  async saveDailySnapshot(branchId: string, date: Date): Promise<void> {
    const query: AnalyticsQueryDto = {
      branchId,
      period: AnalyticsPeriod.CUSTOM,
      dateFrom: new Date(date.setHours(0, 0, 0, 0)).toISOString(),
      dateTo: new Date(date.setHours(23, 59, 59, 999)).toISOString(),
    };

    // الـ Cron يعمل بصلاحيات النظام المطلقة، نمرر حساب يحاكي Super Admin لتجاوز حواجز الفحص
    const systemUser = { role: Role.SUPER_ADMIN };
    const stats = await this.getOrderStats(query, systemUser);
    const peak = await this.getPeakHours(query, systemUser);
    const topPeak = peak[0];

    await this.prisma.dailySalesSnapshot.upsert({
      where: { branchId_date: { branchId, date } },
      update: {
        totalOrders: stats.totalOrders,
        totalRevenue: stats.totalRevenue,
        avgOrderValue: stats.avgOrderValue,
        peakHour: topPeak?.hour,
        cancelledOrders: stats.cancelledOrders,
      },
      create: {
        branchId,
        date,
        totalOrders: stats.totalOrders,
        totalRevenue: stats.totalRevenue,
        avgOrderValue: stats.avgOrderValue,
        peakHour: topPeak?.hour,
        cancelledOrders: stats.cancelledOrders,
      },
    });

    this.logger.log(`Daily snapshot saved for branch ${branchId} on ${date.toDateString()}`);
  }
}