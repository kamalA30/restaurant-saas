import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { KitchenGateway } from './kitchen.gateway';
import { KitchenService } from './kitchen.service';
import { KitchenController } from './kitchen.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    OrdersModule,
    JwtModule.register({}), // Gateway uses JwtService for WS auth
  ],
  providers: [KitchenGateway, KitchenService],
  controllers: [KitchenController],
  exports: [KitchenGateway],
})
export class KitchenModule {}
