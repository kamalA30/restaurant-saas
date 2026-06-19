import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService], // exported so AI Agent module can import it as a tool
})
export class AnalyticsModule {}
