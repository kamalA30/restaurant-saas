import { Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { KitchenService } from './kitchen.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Kitchen')
@ApiBearerAuth('access-token')
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

@Get('queue/:branchId')
  @Roles(Role.CHEF, Role.BRANCH_MANAGER, Role.OWNER, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get live kitchen queue for a branch (REST fallback)' })
  getQueue(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: any, // 👈 أضفنا هذا السطر لالتقاط التوكن
  ) {
    return this.kitchenService.getQueue(branchId, user); // 👈 تمرير الـ user هنا
  }

@Get('stats/:branchId')
  @Roles(Role.CHEF, Role.BRANCH_MANAGER, Role.OWNER, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get kitchen stats (pending/preparing/ready counts)' })
  getStats(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: any, // 👈 التقطنا التوكن والحساب هنا
  ) {
    return this.kitchenService.getStats(branchId, user); // 👈 مررنا الـ user إلى السيرفيس هنا
  }

  @Patch(':orderId/preparing')
  @Roles(Role.CHEF, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Mark order as PREPARING' })
  markPreparing(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: any,
  ) {
    return this.kitchenService.markPreparing(orderId, user);
  }

  @Patch(':orderId/ready')
  @Roles(Role.CHEF, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Mark order as READY (notifies cashier via WebSocket)' })
  markReady(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: any,
  ) {
    return this.kitchenService.markReady(orderId, user);
  }
}
