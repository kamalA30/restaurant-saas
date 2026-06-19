import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController, BranchesController } from './restaurants.controller';

@Module({
  providers: [RestaurantsService],
  controllers: [RestaurantsController, BranchesController],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
