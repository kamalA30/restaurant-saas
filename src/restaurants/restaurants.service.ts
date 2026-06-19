import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRestaurantDto, UpdateRestaurantDto,
  CreateBranchDto, UpdateBranchDto, RestaurantsQueryDto,
} from './dto/restaurants.dto';
// ابحث عن هذا السطر في أعلى ملف السيرفيس وقم بتعديله ليصبح هكذا:
import { paginate, PaginatedResult  } from '../common/pagination/pagination.dto';
// أضف هذا السطر في أعلى ملف الكنترولر مع الـ imports الأخرى
import { UsersQueryDto } from '../users/dto/users.dto';
@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Restaurants ───────────────────────────




async findAllRestaurants(
  query: RestaurantsQueryDto,
  userRestaurantId: string,
  userRole: Role
): Promise<PaginatedResult<any>> { // 👈 تأكد من استخدام الـ PaginatedResult المستوردة
  
  const where: any = {};

  // ── 1. منطق تصفية البيانات بناءً على الرتبة (Access Control) ──
  
  if (userRole === Role.SUPER_ADMIN) {
    // السوبر أدمن: يرى كل المطاعم، وإذا فلتر بمعرف مطعم معين نأخذه بالاعتبار
    if (query.restaurantId) where.id = query.restaurantId;
  } 
  else if (userRole === Role.OWNER) {
    // المالك: مجبر وصارماً على رؤية مطعمه الخاص فقط القادم من التوكن
    where.id = userRestaurantId;
  }

  // ── 2. فلاتر البحث والمدينة والحالة (Query Filters) ──
  
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }
  
  if (query.city) {
    where.city = { contains: query.city, mode: 'insensitive' };
  }
  
  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  // ── 3. تنفيذ الاستعلام وجلب البيانات مقسمة ──
  
  const [restaurants, total] = await Promise.all([
    this.prisma.restaurant.findMany({
      where,
      include: { 
        _count: { select: { branches: true } } 
      },
      skip: query.skip,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.restaurant.count({ where }),
  ]);

  // ── 4. إرجاع النتيجة بالـ Pagination النظيف ──
  return paginate(restaurants, total, query);
}

  
  async findRestaurantOne(id: string) {

  
    const r = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        branches: { where: { isActive: true } },
        _count: { select: { branches: true } },
      },
    });
    if (!r) throw new NotFoundException('Restaurant not found');
    return r;
  }

  
 async findRestaurant(id: string, userRestaurantId: string, userRole: Role) {
  
  // 1. إذا كان المستخدم SUPER_ADMIN، يتخطى شرط المطابقة ويشاهد أي مطعم
  const isSuperAdmin = userRole === Role.SUPER_ADMIN;

  console.log("userRestaurantId :  " + userRestaurantId )
    console.log("id :  " + id )

  // 2. إذا لم يكن Admin، يجب أن يتطابق id المطعم المطلوب مع restaurantId الذي في التوكن
  if (!isSuperAdmin && userRestaurantId !== id) {
    throw new ForbiddenException('You do not have access to this restaurant');
  }

  // 3. جلب بيانات المطعم بعد نجاح التحقق
  const r = await this.prisma.restaurant.findUnique({
    where: { id },
    include: {
      branches: { where: { isActive: true } },
      _count: { select: { branches: true } },
    },
  });

  if (!r) throw new NotFoundException('Restaurant not found');
  
  return r;
}





  async createRestaurant(dto: CreateRestaurantDto, ownerId: string) {
    return this.prisma.restaurant.create({
      data: {
        ...dto,
        owners: { connect: { id: ownerId } },
      },
    });
  }

  async updateRestaurant(id: string, dto: UpdateRestaurantDto, user: any) {
    await this.assertRestaurantAccess(id, user);
    return this.prisma.restaurant.update({ where: { id }, data: dto });
  }

  async deleteRestaurant(id: string) {
    await this.findRestaurantOne(id);
    return this.prisma.restaurant.update({ where: { id }, data: { isActive: false } });
  }

  // ── Branches ──────────────────────────────
 

async findBranches(
  restaurantId: string,     // المعرف الممرر من الرابط (المطعم المطلوب)
  query: RestaurantsQueryDto,
  userRestaurantId: string, // القادم من التوكن الفعلي للمستخدم
  userRole: Role,          // رتبة المستخدم الحالية
  userId: string           // معرف المستخدم لمدير الفرع
): Promise<PaginatedResult<any>> {
  
  const where: any = {};

  // ── 1. جدار الحماية الصارم (Strict Cross-Tenant Validation) ──
  
  // إذا لم يكن المستخدم SUPER_ADMIN، يمنع منعاً باتاً طلب معرف مطعم يختلف عن توكنه
  if (userRole !== Role.SUPER_ADMIN) {
    if (restaurantId && restaurantId !== userRestaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant resources');
    }
  }

  // ── 2. منطق تصفية الفروع بناءً على الرتبة الموثوقة ──

  if (userRole === Role.SUPER_ADMIN) {
    // السوبر أدمن: يرى فروع المطعم المحدد في الرابط، وإذا لم يحدد يرى كل فروع النظام
    if (restaurantId) where.restaurantId = restaurantId;
  } 
  
  else if (userRole === Role.OWNER) {
    // المالك: بعد اجتياز فحص الرابط التابع له، نثبت تصفية الفروع على مطعمه
    where.restaurantId = userRestaurantId;
  } 
  
  else if (userRole === Role.BRANCH_MANAGER) {
    // مدير الفرع: نثبت تصفية المطعم أولاً
    where.restaurantId = userRestaurantId;

    // ثانياً: نجلب الفروع المسموحة له شخصياً
    const managerBranches = await this.prisma.branchUser.findMany({
      where: { userId: userId },
      select: { branchId: true }
    });

    const branchIds = managerBranches.map(b => b.branchId);

    if (branchIds.length > 0) {
      where.id = { in: branchIds };
    } else {
      // إذا لم يكن مرتبطاً بفرع، نعيد نتائج فارغة بأمان
      where.id = '00000000-0000-0000-0000-000000000000'; 
    }
  }

  // ── 3. منطق البحث العام والفلترة (Search & Filters) ──
  
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }
  
  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  // ── 4. تنفيذ الاستعلام وجلب البيانات ──
  
  const [branches, total] = await Promise.all([
    this.prisma.branch.findMany({
      where,
      include: { 
        _count: { select: { orders: true, branchUsers: true } } 
      },
      skip: query.skip,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.branch.count({ where }),
  ]);

  return paginate(branches, total, query);
}

  async findBranch1(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        branchUsers: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } } },
        _count: { select: { orders: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }
async findBranch(
  id: string,               // الـ ID الخاص بالفرع المطلوب من الرابط
  userRestaurantId: string, // القادم من التوكن لحماية المطعم
  userRole: Role,          // رتبة المستخدم الحالية
  userId: string           // معرف المستخدم لفحص فروع مدير الفرع
) {
  // 1. جلب بيانات الفرع المطلوب أولاً مع الموظفين المرتبطين به
  const branch = await this.prisma.branch.findUnique({
    where: { id },
    include: {
      branchUsers: { 
        include: { 
          user: { 
            select: { id: true, firstName: true, lastName: true, email: true, role: true } 
          } 
        } 
      },
      _count: { select: { orders: true } },
    },
  });

  // إذا لم يكن الفرع موجوداً في قاعدة البيانات من الأساس
  if (!branch) {
    throw new NotFoundException('Branch not found');
  }

  // ── 2. منطق الحماية والأمان المتقدم (Access Control Logic) ──

  // أ) السوبر أدمن (SUPER_ADMIN): يتخطى القيود ويرى أي فرع في النظام
  if (userRole === Role.SUPER_ADMIN) {
    return branch;
  }

  // ب) المالك (OWNER): يجب أن يكون الفرع المطلوب تابعاً لمطعمه الخاص حتماً
  if (userRole === Role.OWNER) {
    if (branch.restaurantId !== userRestaurantId) {
      throw new ForbiddenException('You do not have permission to access this branch');
    }
    return branch;
  }

  // ج) مدير الفرع (BRANCH_MANAGER): يجب أن يكون هذا الفرع تحديداً من ضمن الفروع المعين لإدارتها
  if (userRole === Role.BRANCH_MANAGER) {
    // أولاً: تأمين كونه في نفس المطعم
    if (branch.restaurantId !== userRestaurantId) {
      throw new ForbiddenException('You do not have permission to access this branch');
    }

    // ثانياً: التحقق هل هو من ضمن طاقم هذا الفرع في جدول الـ branchUsers؟
    const isManagerOfThisBranch = branch.branchUsers.some(bu => bu.userId === userId);

    if (!isManagerOfThisBranch) {
      throw new ForbiddenException('You only have access to your assigned branch');
    }
    
    return branch;
  }

  // حماية احتياطية لأي رتبة أخرى غير مصرح لها
  throw new ForbiddenException('Unauthorized access');
}
  async createBranch(dto: CreateBranchDto, user: any) {
    await this.assertRestaurantAccess(dto.restaurantId, user);
    return this.prisma.branch.create({ data: dto });
  }

  async updateBranch(id: string, dto: UpdateBranchDto, user: any) {
    const branch = await this.findBranch1(id);
    await this.assertRestaurantAccess(branch.restaurantId, user);
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  async deleteBranch(id: string, user: any) {
    const branch = await this.findBranch1(id);
    await this.assertRestaurantAccess(branch.restaurantId, user);
    return this.prisma.branch.update({ where: { id }, data: { isActive: false } });
  }

  // ── Access control helper ─────────────────

  private async assertRestaurantAccess(restaurantId: string, user: any) {
    if (user.role === Role.SUPER_ADMIN) return;
    if (user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }
  }
}
