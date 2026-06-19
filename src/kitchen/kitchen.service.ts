import { Injectable, Logger, NotFoundException  , ForbiddenException} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { KitchenGateway } from './kitchen.gateway';
import { UpdateOrderStatusDto } from '../orders/dto/orders.dto';
import { OrderStatus , Role } from '@prisma/client';

@Injectable()
export class KitchenService {
  private readonly logger = new Logger(KitchenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly gateway: KitchenGateway,
  ) {}

  async getQueue(branchId: string , user: any) {
  return this.ordersService.getKitchenQueue(branchId, user);
  }

  async markPreparing(orderId: string, user: any) {
    const dto: UpdateOrderStatusDto = { status: OrderStatus.PREPARING };
    const order = await this.ordersService.updateStatus(orderId, dto, user);
    this.gateway.broadcastToKitchen(order.branchId, 'order:preparing', {
      orderId,
      orderNumber: order.orderNumber,
    });
    return order;
  }

  async markReady(orderId: string, user: any) {
    const dto: UpdateOrderStatusDto = { status: OrderStatus.READY };
    const order = await this.ordersService.updateStatus(orderId, dto, user);
    // Notify cashiers that order is ready for pickup
    this.gateway.broadcastToBranch(order.branchId, 'order:ready', {
      orderId,
      orderNumber: order.orderNumber,
      tableNumber: (order as any).tableNumber,
    });
    return order;
  }

// ── 📊 جلب إحصائيات المطبخ المحمية والمؤمنة ──
  async getStats(branchId: string, currentUser: any) {
    
    // 1. 🛡️ جدار حماية الصلاحيات وعزل الفروع
    // إذا لم يكن المستخدم SUPER_ADMIN أو OWNER، نجبره على فحص التعيين الميداني
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.role !== Role.OWNER) {
      
      // التحقق من أن الموظف معين للعمل في هذا الفرع تحديداً في قاعدة البيانات
      const isAssigned = await this.prisma.branchUser.findFirst({
        where: { 
          userId: currentUser.id, 
          branchId: branchId 
        }
      });

      // إذا لم يتم العثور على التعيين، يتم قذف استثناء حظر الوصول فوراً
      if (!isAssigned) {
        throw new ForbiddenException('You do not have access to this branch kitchen statistics');
      }
    }

    // 2. الاستعلام الأحادي الآمن بعد تخطي الفحص الأمني بنجاح
    const statsGroup = await this.prisma.order.groupBy({
      by: ['status'],
      where: {
        branchId,
        status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY] }
      },
      _count: {
        id: true
      }
    });

    // 3. تحويل المصفوفة الناتجة إلى كائن مقروء وسهل للفرونت إند
    const counts = { pending: 0, preparing: 0, ready: 0 };
    
    statsGroup.forEach(group => {
      if (group.status === OrderStatus.PENDING) counts.pending = group._count.id;
      if (group.status === OrderStatus.PREPARING) counts.preparing = group._count.id;
      if (group.status === OrderStatus.READY) counts.ready = group._count.id;
    });

    return {
      branchId,
      queue: {
        ...counts,
        total: counts.pending + counts.preparing + counts.ready
      },
      timestamp: new Date().toISOString(),
    };
  }



}
