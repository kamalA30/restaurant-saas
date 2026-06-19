import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrdersQueryDto, UpdateOrderStatusDto } from './dto/orders.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BranchIntersectionGuard } from '../auth/guards/BranchIntersectionGuard';

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(BranchIntersectionGuard)
  @Roles(Role.CASHIER, Role.WAITER, Role.BRANCH_MANAGER, Role.OWNER) // 👈 أضفنا الـ WAITER هنا لإنشاء الطلبات
  @ApiOperation({ summary: 'Create a new order (Waiter/Cashier)' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() currentUser: any) {
    return this.ordersService.createOrder(dto, currentUser);
  }

  @Get()
  @UseGuards(BranchIntersectionGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER, Role.CASHIER, Role.WAITER, Role.CHEF)
  @ApiOperation({ summary: 'List orders with filtering & pagination' })
  findAll(@Query() query: OrdersQueryDto, @CurrentUser() user: any) {
    return this.ordersService.findAll(query, user);
  }

  @Get('kitchen-queue/:branchId')
  @UseGuards(BranchIntersectionGuard)
  @Roles(Role.CHEF, Role.BRANCH_MANAGER, Role.OWNER, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get pending/preparing orders for the kitchen' })
  kitchenQueue(@Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() currentUser: any) {
    return this.ordersService.getKitchenQueue(branchId, currentUser);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER, Role.CASHIER, Role.WAITER, Role.CHEF)
  @ApiOperation({ summary: 'Get order details with isolation checks' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: any) {
    return this.ordersService.findOneSecure(id, currentUser);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER, Role.CHEF, Role.CASHIER)
  @ApiOperation({ summary: 'Update order status (role-restricted state machine)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateStatus(id, dto, user);
  }

  @Patch(':id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER, Role.CASHIER)
  @ApiOperation({ summary: 'Cancel an order' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.ordersService.cancelOrder(id, user);
  }
}