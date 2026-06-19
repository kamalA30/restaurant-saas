import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AnalyticsService } from '../../analytics/analytics.service';
import { AnalyticsPeriod } from '../../analytics/dto/analytics.dto';

// 1. أداة ملخص المبيعات
export const createOrderStatsTool = (analyticsService: AnalyticsService) =>
  new DynamicStructuredTool({
    name: 'get_order_stats_summary',
    description: 'جلب ملخص إحصائي دقيق للمبيعات، الإيرادات الإجمالية، الطلبات المكتملة والملغاة، ومتوسط وقت التحضير لفترة محددة.',
    schema: z.object({
      period: z.nativeEnum(AnalyticsPeriod).optional(),
      branchId: z.string().uuid().optional(),
      restaurantId: z.string().uuid().optional(),
    }),
    func: async (input) => {
      const result = await analyticsService.getOrderStats(input);
      return JSON.stringify(result);
    },
  });

// 2. أداة الأطباق الأعلى مبيعاً
export const createTopItemsTool = (analyticsService: AnalyticsService) =>
  new DynamicStructuredTool({
    name: 'get_top_selling_items',
    description: 'جلب قائمة بالأطباق الأكثر مبيعاً والأعلى تحقيقاً للأرباح في المطعم بناءً على الفترة والفرع المحدد.',
    schema: z.object({
      period: z.nativeEnum(AnalyticsPeriod).optional(),
      branchId: z.string().uuid().optional(),
      restaurantId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    func: async (input) => {
      const result = await analyticsService.getTopSellingItems(input);
      return JSON.stringify(result);
    },
  });

// 3. أداة اللقطة التحليلية الكاملة
export const createFullSnapshotTool = (analyticsService: AnalyticsService) =>
  new DynamicStructuredTool({
    name: 'get_full_analytics_snapshot',
    description: 'أداة قوية تجلب تقريراً تحليلياً شاملاً يحتوي على كل شيء دفعة واحدة (الملخص، الأطباق الأعلى، أداء الفروع، ساعات الذروة، والأطباق ضعيفة الأداء). استخدمها عند طلب تحليل عام أو أداء كلي للمطعم.',
    schema: z.object({
      period: z.nativeEnum(AnalyticsPeriod).optional(),
      restaurantId: z.string().uuid().optional(),
    }),
    func: async (input) => {
      const result = await analyticsService.getFullSnapshot(input);
      return JSON.stringify(result);
    },
  });