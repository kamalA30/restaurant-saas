import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PrismaModule } from './prisma/prisma.module';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';


import { AiAgentModule } from './ai-agent/ai-agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // التعديل الجذري: إزالة الاعتماد على أي مكتبة خارجية للتخزين
    // هذا التكوين يعمل بشكل افتراضي وبدون أي تعارض مع NestJS 11
    ThrottlerModule.forRoot([
      {
        name: 'auth-limit',
        ttl: 60000, 
        limit: 20,
      },
      {
        name: 'global-limit',
        ttl: 1000,
        limit: 5,
      },
    ]),

    PrismaModule,
    AuthModule,
    UsersModule,
    RestaurantsModule,
    MenuModule,
    OrdersModule,
    KitchenModule,
    AnalyticsModule,
    AiAgentModule,

  ],
})
export class AppModule {}