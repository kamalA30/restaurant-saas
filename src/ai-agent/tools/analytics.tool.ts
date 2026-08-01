import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AnalyticsService } from '../../analytics/analytics.service';
import { AnalyticsPeriod } from '../../analytics/dto/analytics.dto';

// 1. Order Statistics Summary Tool
export const createOrderStatsTool = (analyticsService: AnalyticsService) =>
  new DynamicStructuredTool({
    name: 'get_order_stats_summary',
    description: 'Fetch an accurate statistical summary of sales, total revenue, completed/canceled orders, and average preparation time for a specified time period.',
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

// 2. Top Selling Items Tool
export const createTopItemsTool = (analyticsService: AnalyticsService) =>
  new DynamicStructuredTool({
    name: 'get_top_selling_items',
    description: 'Fetch a list of top-selling and highest-grossing menu items for the restaurant based on the specified period and branch.',
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

// 3. Full Analytics Snapshot Tool
export const createFullSnapshotTool = (analyticsService: AnalyticsService) =>
  new DynamicStructuredTool({
    name: 'get_full_analytics_snapshot',
    description: 'A comprehensive analytics tool fetching a complete overview report (summary, top items, branch performance, peak hours, and underperforming items). Use when overall restaurant performance analysis is requested.',
    schema: z.object({
      period: z.nativeEnum(AnalyticsPeriod).optional(),
      restaurantId: z.string().uuid().optional(),
    }),
    func: async (input) => {
      const result = await analyticsService.getFullSnapshot(input);
      return JSON.stringify(result);
    },
  });
