import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, OrdersQueryDto, UpdateOrderStatusDto } from './dto/orders.dto';
import { paginate } from '../common/pagination/pagination.dto';

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── ➕ إنشاء طلب جديد آمن ──
  async createOrder(dto: CreateOrderDto, currentUser: any) {
    // 1. جلب الفرع والتأكد من وجوده وتبعيته لمطعم المستخدم
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId, isActive: true },
      select: { id: true, restaurantId: true },
    });
    if (!branch) throw new NotFoundException('Branch not found or inactive');

    // جدار حماية لمنع موظف من مطعم منافس من حقن طلبات في فروعك
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.restaurantId !== branch.restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant branch');
    }

    // جدار حماية للموظفين التشغيليين (الكاشير والنادل): يجب أن ينتموا للفرع المحدد للطلب حتماً
    if (currentUser.role === Role.CASHIER || currentUser.role === Role.WAITER) {
      const isAssigned = await this.prisma.branchUser.findFirst({
        where: { userId: currentUser.id, branchId: dto.branchId }
      });
      if (!isAssigned) throw new ForbiddenException('You are not assigned to work in this branch');
    }

    // 2. جلب المنيو وحساب الأسعار التابعة للفرع (يترك كما هو في كودك الأصلي الممتاز)
    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, isActive: true },
      include: { branchOverrides: { where: { branchId: dto.branchId } } },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw new BadRequestException('One or more menu items not found or inactive');
    }

    let subtotal = 0;
    const orderItems = dto.items.map((item) => {
      const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
      const override = menuItem.branchOverrides[0];

      if (override && !override.isAvailable) {
        throw new BadRequestException(`Item "${menuItem.name}" is not available at this branch`);
      }

      const unitPrice = Number(override?.price ?? menuItem.basePrice);
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      return { menuItemId: item.menuItemId, quantity: item.quantity, unitPrice, totalPrice, note: item.note };
    });

    const tax = subtotal * 0.19; // 19% VAT
    const total = subtotal + tax;
    const orderNumber = await this.generateOrderNumber(dto.branchId);

    // 3. تخزين الطلب في قاعدة البيانات (ربطه بالـ userId الخاص بمن أنشأه سواء كاشير أو نادل)
    const order = await this.prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          orderNumber,
          branchId: dto.branchId,
          cashierId: currentUser.id, // الحقل في جدولك مخزن كـ cashierId وهو يمثل منشئ الطلب الحالي
          paymentMethod: dto.paymentMethod,
          note: dto.note,
          tableNumber: dto.tableNumber,
          subtotal,
          tax,
          total,
          pendingAt: new Date(),
          items: { create: orderItems },
        },
        include: {
          items: { include: { menuItem: { select: { id: true, name: true } } } },
          branch: { select: { id: true, name: true, restaurantId: true } },
          cashier: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    // 4. البث الفوري عبر الـ WebSockets للمطبخ والكاشير
    this.events.emit('order.created', order);
    this.logger.log(`Order ${order.orderNumber} created by ${currentUser.role} at branch ${dto.branchId}`);

    return order;
  }

  // ── 🔍 جلب القائمة بالفلاتر (تمت مراجعته وتأمينه) ──
// ── 🔍 جلب القائمة بالفلاتر (النسخة الكاملة والمعدلة) ──
  async findAll(query: OrdersQueryDto, user: any) {
    const where: any = {};

    // 1. جدار حماية أساسي: عزل البيانات على مستوى المطعم لغير الـ SUPER_ADMIN
    if (user.role !== Role.SUPER_ADMIN) {
      where.branch = { restaurantId: user.restaurantId };
    }

    // 2. تطبيق جدار الصلاحيات التشغيلي بناءً على دور المستخدم (Role)
    if (user.role === Role.WAITER) {
      // النادل يرى فقط الطلبات التي أنشأها بنفسه لضمان عدم تداخل الطاولات
      where.cashierId = user.id;
    } 
    else if (user.role === Role.CASHIER || user.role === Role.CHEF || user.role === Role.BRANCH_MANAGER) {
      // الكاشير، الشيف، والمدير يجب أن يروْا طلبات الفرع كاملاً المشتركة لضمان سير العمل
      // جلب الفروع المعين عليها هذا الموظف من جدول الـ BranchUser
      const assignments = await this.prisma.branchUser.findMany({
        where: { userId: user.id },
        select: { branchId: true },
      });
      
      const assignedBranchIds = assignments.map((a) => a.branchId);

      // إذا قام الموظف بتمرير فرع معين في الـ Query Params، نتحقق من صلاحيته عليه
      if (query.branchId) {
        if (!assignedBranchIds.includes(query.branchId) && user.role !== Role.SUPER_ADMIN) {
          throw new ForbiddenException('You do not have access to this branch data');
        }
        where.branchId = query.branchId;
      } else {
        // إذا لم يمرر فرع محدد، نجبره على رؤية طلبات كافة الفروع المعين عليها فقط
        where.branchId = { in: assignedBranchIds };
      }
    }

    // 3. تطبيق فلترة الـ Query Params الإضافية (مثل الحالة والـ Pagination)
    if (query.status) {
      where.status = query.status;
    }

    // حساب الـ skip والـ limit من الـ query الممرر
    const skip = query.skip ?? (query.page ? (query.page - 1) * (query.limit ?? 20) : 0);
    const limit = query.limit ?? 20;

    // 4. تنفيذ الاستعلام المتزامن في قاعدة البيانات لجلب البيانات والعدد الإجمالي
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: { 
            include: { 
              menuItem: { select: { name: true } } 
            } 
          },
          cashier: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true } },
        },
        skip: skip,
        take: limit,
        orderBy: { createdAt: 'desc' }, // جلب الأحدث دائماً في الأعلى
      }),
      this.prisma.order.count({ where }),
    ]);

    // 5. إرجاع البيانات مغلفة بتابع الـ Pagination الخاص بنظامك
    return paginate(orders, total, query);
  }

  // ── 🛡️ جلب تفاصيل طلب واحد بشكل آمن محمي ──
// ── 🛡️ النسخة المعدلة من findOneSecure ──
async findOneSecure(id: string, currentUser: any) {
  const order = await this.prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true, imageUrl: true } } } },
      cashier: { select: { id: true, firstName: true, lastName: true } },
      branch: { select: { id: true, name: true, address: true, restaurantId: true } },
    },
  });
  if (!order) throw new NotFoundException('Order not found');

  // 1. الـ SUPER_ADMIN يمر دائماً
  if (currentUser.role === Role.SUPER_ADMIN) return order;

  // 2. حماية أساسية: منع الوصول لطلب يتبع لمطعم آخر تماماً
  if (order.branch.restaurantId !== currentUser.restaurantId) {
    throw new ForbiddenException('You do not have access to this order');
  }

  // 3. 🚨 التعديل هنا: النادل يرى طلباته فقط
  if (currentUser.role === Role.WAITER && order.cashierId !== currentUser.id) {
    throw new ForbiddenException('You can only access your own orders');
  }

  // 4. الكاشير، الشيف، والمدير: يجب التأكد أنهم معينون على هذا الفرع الذي يتبع له الطلب
  if (currentUser.role === Role.CASHIER || currentUser.role === Role.CHEF || currentUser.role === Role.BRANCH_MANAGER) {
    const isAssigned = await this.prisma.branchUser.findFirst({
      where: { userId: currentUser.id, branchId: order.branchId }
    });
    if (!isAssigned) {
      throw new ForbiddenException('You do not have access to orders outside your assigned branch');
    }
  }

  return order;
}

  // ── 📝 تحديث حالة الطلب مع قفل تداخل الفروع ──
  async updateStatus(id: string, dto: UpdateOrderStatusDto, user: any) {
    // جلب الطلب وفحصه أمنياً أولاً
 const order = await this.findOneSecure(id, user);

  // التحقق من صلاحية الموظف للعمل داخل هذا الفرع (للشيف، الكاشير، والمدير)
  if (user.role === Role.CHEF || user.role === Role.BRANCH_MANAGER || user.role === Role.CASHIER) {
    const isAssigned = await this.prisma.branchUser.findFirst({
      where: { userId: user.id, branchId: order.branchId }
    });
    if (!isAssigned && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You can only update orders within your assigned branch');
    }
  }

    const allowedNext = STATUS_TRANSITIONS[order.status];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${dto.status}. Allowed: ${allowedNext.join(', ')}`);
    }

    this.assertTransitionAllowed(order.status, dto.status, user.role);
    const timestampField = this.getStatusTimestampField(dto.status);

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        [timestampField]: new Date(),
        ...(dto.status === OrderStatus.COMPLETED && { paymentStatus: PaymentStatus.PAID }),
      },
      include: { items: true, branch: { select: { id: true, name: true } } },
    });

    this.events.emit('order.status_changed', updated);
    return updated;
  }

  async cancelOrder(id: string, user: any) {
    return this.updateStatus(id, { status: OrderStatus.CANCELLED }, user);
  }

  // ── 🍳 طابور المطبخ الآمن ──
  async getKitchenQueue(branchId: string, currentUser: any) {
    if (currentUser.role === Role.CHEF || currentUser.role === Role.BRANCH_MANAGER) {
      const isAssigned = await this.prisma.branchUser.findFirst({
        where: { userId: currentUser.id, branchId }
      });
      if (!isAssigned && currentUser.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException('You only have access to your assigned branch kitchen queue');
      }
    }

    return this.prisma.order.findMany({
      where: {
        branchId,
        status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING] },
      },
      include: {
        items: { include: { menuItem: { select: { name: true, preparationTimeMinutes: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ... الدوال المساعدة الأخرى (generateOrderNumber, getStatusTimestampField, assertTransitionAllowed) تترك كما هي
  private async generateOrderNumber(branchId: string): Promise<string> {
    const count = await this.prisma.order.count({
      where: {
        branchId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });
    const prefix = branchId.slice(0, 4).toUpperCase();
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  private getStatusTimestampField(status: OrderStatus): string {
    const map: Partial<Record<OrderStatus, string>> = {
      [OrderStatus.PREPARING]: 'preparingAt',
      [OrderStatus.READY]: 'readyAt',
      [OrderStatus.COMPLETED]: 'completedAt',
      [OrderStatus.CANCELLED]: 'cancelledAt',
    };
    return map[status] || 'updatedAt';
  }

  private assertTransitionAllowed(from: OrderStatus, to: OrderStatus, role: Role) {
    if (role === Role.CHEF) {
      if (![OrderStatus.PREPARING, OrderStatus.READY].includes(to)) {
        throw new ForbiddenException('Chefs can only set orders to PREPARING or READY');
      }
    }
    if (role === Role.CASHIER) {
      if (to === OrderStatus.PREPARING) {
        throw new ForbiddenException('Cashiers cannot set orders to PREPARING');
      }
    }
  }
}