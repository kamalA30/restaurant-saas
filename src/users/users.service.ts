import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, AssignBranchDto, UsersQueryDto } from './dto/users.dto';
import { paginate, PaginatedResult } from '../common/pagination/pagination.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  restaurantId: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 🔍 جلب قائمة المستخدمين بالفلاتر والصلاحيات ──
  async findAll(
    query: UsersQueryDto, 
    userRestaurantId: string, 
    userRole: Role, 
    userId: string
  ): Promise<PaginatedResult<any>> {
    const where: any = {};

    // 1. منطق تصفية البيانات بناءً على الرتبة
    if (userRole === Role.SUPER_ADMIN) {
      if (query.restaurantId) where.restaurantId = query.restaurantId;
    } 
    else if (userRole === Role.OWNER) {
      where.restaurantId = userRestaurantId;
    } 
    else if (userRole === Role.BRANCH_MANAGER) {
      const managerBranches = await this.prisma.branchUser.findMany({
        where: { userId: userId },
        select: { branchId: true }
      });

      const branchIds = managerBranches.map(b => b.branchId);

      if (branchIds.length > 0) {
        where.branchUsers = {
          some: {
            branchId: { in: branchIds }
          }
        };
      } else {
        where.id = userId; 
      }
    }

    // 2. منطق البحث العام
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // 3. فلاتر إضافية
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.branchId && userRole !== Role.BRANCH_MANAGER) {
       where.branchUsers = { some: { branchId: query.branchId } };
    }

    // 4. تنفيذ الاستعلام وجلب البيانات
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { 
          ...USER_SELECT, 
          branchUsers: { select: { branchId: true, role: true } } 
        },
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(users, total, query);
  }

  // ── 🔍 جلب مستخدم واحد بالمعرف مع الصلاحيات ──
  async findOne(
    id: string, 
    userRestaurantId: string, 
    userRole: Role, 
    userId: string
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SELECT,
        branchUsers: {
          select: {
            role: true,
            branch: { select: { id: true, name: true, restaurantId: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // تطبيق منطق الصلاحيات والأمان
    if (userRole === Role.SUPER_ADMIN) return user;

    if (userRole === Role.OWNER) {
      if (user.restaurantId !== userRestaurantId) {
        throw new ForbiddenException('You do not have permission to access this user');
      }
      return user;
    }

    if (userRole === Role.BRANCH_MANAGER) {
      if (user.id === userId) return user;

      const managerBranches = await this.prisma.branchUser.findMany({
        where: { userId: userId },
        select: { branchId: true }
      });
      const managerBranchIds = managerBranches.map(b => b.branchId);

      const isTargetUserInManagerBranches = user.branchUsers.some(bu => 
        managerBranchIds.includes(bu.branch.id)
      );

      if (!isTargetUserInManagerBranches) {
        throw new ForbiddenException('You only have access to users within your assigned branches');
      }

      return user;
    }

    throw new ForbiddenException('Unauthorized access');
  }

  // دالة داخلية مستخدمة للتحديث والتعطيل للتأكد من وجود العنصر
  private async findOneInternal(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ── ➕ إنشاء مستخدم جديد ──
  async create(dto: CreateUserDto, currentUser: any) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    // المالك يُجبر على مطعمه من التوكن، والسوبر أدمن يختار المطعم من الـ DTO
    const targetRestaurantId = currentUser.role === Role.SUPER_ADMIN ? dto.restaurantId : currentUser.restaurantId;
    
    await this.assertRestaurantAccess(targetRestaurantId, currentUser);

    const hashed = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { 
        ...dto, 
        password: hashed,
        restaurantId: targetRestaurantId 
      },
      select: USER_SELECT,
    });
  }

  // ── 📝 تعديل بيانات مستخدم ──
  async update(id: string, dto: UpdateUserDto, currentUser: any) {
    const targetUser = await this.findOneInternal(id);
    
    // جدار الحماية للمالك والسوبر أدمن
    await this.assertRestaurantAccess(targetUser.restaurantId, currentUser);

    const data: any = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  // ── 🚫 تعطيل حساب مستخدم (Soft Delete) ──
  async deactivate(id: string, currentUser: any) {
    const targetUser = await this.findOneInternal(id);
    
    await this.assertRestaurantAccess(targetUser.restaurantId, currentUser);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
  }

  // ── 🔗 ربط موظف بفرع محدد ──
  async assignToBranch(dto: AssignBranchDto, currentUser: any) {
    const [branch, user] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
    ]);
    if (!branch) throw new NotFoundException('Branch not found');
    if (!user) throw new NotFoundException('User not found');

    // التحقق من صلاحية المالك على الفرع والمستخدم معاً
    await this.assertRestaurantAccess(branch.restaurantId, currentUser);
    await this.assertRestaurantAccess(user.restaurantId, currentUser);

    return this.prisma.branchUser.upsert({
      where: { branchId_userId: { branchId: dto.branchId, userId: dto.userId } },
      update: { role: dto.role },
      create: { branchId: dto.branchId, userId: dto.userId, role: dto.role },
    });
  }

  // ── ✂️ إزالة موظف من فرع ──
  async removeFromBranch(branchId: string, userId: string, currentUser: any) {
    const [branch, user] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: branchId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!branch) throw new NotFoundException('Branch not found');
    if (!user) throw new NotFoundException('User not found');

    await this.assertRestaurantAccess(branch.restaurantId, currentUser);
    await this.assertRestaurantAccess(user.restaurantId, currentUser);

    return this.prisma.branchUser.delete({
      where: { branchId_userId: { branchId, userId } },
    });
  }

  // ── 🧱 دالة الفحص المساعدة لمنع تقاطع البيانات ──
  private async assertRestaurantAccess(restaurantId: string, currentUser: any) {
    if (currentUser.role === Role.SUPER_ADMIN) return;
    if (!currentUser.restaurantId || currentUser.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant resources');
    }
  }
}