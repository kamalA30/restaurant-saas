import { Injectable, NotFoundException , ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateMenuItemDto, UpdateMenuItemDto,
  BranchMenuOverrideDto, MenuQueryDto,
} from './dto/menu.dto';
import { paginate } from '../common/pagination/pagination.dto';
import { Role } from '@prisma/client';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ────────────────────────────

  async findCategories(restaurantId: string, branchId?: string) {
    return this.prisma.category.findMany({
      where: {
        restaurantId,
        isActive: true,
        OR: [
          { branchId: null }, 
          ...(branchId ? [{ branchId }] : []), 
        ],
      },
      include: { 
        _count: { 
          select: { items: true } 
        } 
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findCategory(id: string) {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { items: { where: { isActive: true } } },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async createCategory(dto: CreateCategoryDto, currentUser: any) {
    const targetRestaurantId = currentUser.role === Role.SUPER_ADMIN ? dto.restaurantId : currentUser.restaurantId;
    await this.assertRestaurantAccess(targetRestaurantId, currentUser);

    if (currentUser.role === Role.BRANCH_MANAGER) {
      const managerBranch = await this.prisma.branchUser.findFirst({
        where: { userId: currentUser.id, branchId: dto.branchId }
      });
      if (!managerBranch || !dto.branchId) {
        throw new ForbiddenException('Branch managers can only create categories for their assigned branch');
      }
    }

    if (currentUser.role === Role.OWNER && dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch || branch.restaurantId !== currentUser.restaurantId) {
        throw new ForbiddenException('This branch does not belong to your restaurant');
      }
    }

    return this.prisma.category.create({
      data: {
        ...dto,
        restaurantId: targetRestaurantId
      }
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, currentUser: any) {
    const category = await this.findCategoryInternal(id);
    await this.assertRestaurantAccess(category.restaurantId, currentUser);

    if (currentUser.role === Role.BRANCH_MANAGER) {
      const managerBranch = await this.prisma.branchUser.findFirst({
        where: { userId: currentUser.id, branchId: category.branchId }
      });
      if (!managerBranch || category.branchId !== managerBranch.branchId) {
        throw new ForbiddenException('You only have permission to update categories in your assigned branch');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: dto
    });
  }

  async deleteCategory(id: string, currentUser: any) {
    const category = await this.findCategoryInternal(id);
    await this.assertRestaurantAccess(category.restaurantId, currentUser);

    return this.prisma.category.update({
      where: { id },
      data: { isActive: false }
    });
  }

  private async findCategoryInternal(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async assertRestaurantAccess(restaurantId: string, currentUser: any) {
    if (currentUser.role === Role.SUPER_ADMIN) return;
    if (!currentUser.restaurantId || currentUser.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant resources');
    }
  }

  // ── Menu Items ────────────────────────────

  async findItems(query: MenuQueryDto) {
    const where: any = { isActive: true };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.isAvailable !== undefined) where.isAvailable = query.isAvailable;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query.restaurantId) {
      where.category = { restaurantId: query.restaurantId };
    }

    const [items, total] = await Promise.all([
      this.prisma.menuItem.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, restaurantId: true } },
          ...(query.branchId
            ? { branchOverrides: { where: { branchId: query.branchId } } }
            : {}),
        },
        skip: query.skip,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    const data = query.branchId
      ? items.map((item) => {
          const override = (item as any).branchOverrides?.[0];
          return {
            ...item,
            effectivePrice: override?.price ?? item.basePrice,
            isAvailable: override !== undefined ? override.isAvailable : item.isAvailable,
            branchOverrides: undefined,
          };
        })
      : items;

    return paginate(data, total, query);
  }

  async findItem(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: { category: true, branchOverrides: true },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  // ── ➕ إنشاء عنصر منيو جديد ──
  async createItem(dto: CreateMenuItemDto, currentUser: any) {
    // 1. جلب الـ Category المستهدفة لمعرفة المطعم والفرع المرتبطة بهما
    const category = await this.findCategoryInternal(dto.categoryId);

    // 2. التحقق من صلاحية الوصول للمطعم التابع له هذا التصنيف
    await this.assertRestaurantAccess(category.restaurantId, currentUser);

    // 3. جدار حماية لمدير الفرع (BRANCH_MANAGER)
    if (currentUser.role === Role.BRANCH_MANAGER) {
      // إذا كانت الـ Category عامة للمطعم (branchId فيها null) أو تتبع لفرع آخر غير فرعه، يمنع فوراً
      const managerBranch = await this.prisma.branchUser.findFirst({
        where: { userId: currentUser.id, branchId: category.branchId }
      });

      if (!managerBranch || category.branchId !== managerBranch.branchId) {
        throw new ForbiddenException('Branch managers can only add items to categories assigned to their branch');
      }
    }

    return this.prisma.menuItem.create({ data: dto });
  }

  // ── 📝 تعديل عنصر منيو ──
  async updateItem(id: string, dto: UpdateMenuItemDto, currentUser: any) {
    const item = await this.findItem(id);

    // 1. التحقق من أمان المطعم التابع له العنصر
    await this.assertRestaurantAccess(item.category.restaurantId, currentUser);

    // 2. جدار حماية لمدير الفرع عند التعديل
    if (currentUser.role === Role.BRANCH_MANAGER) {
      const managerBranch = await this.prisma.branchUser.findFirst({
        where: { userId: currentUser.id, branchId: item.category.branchId }
      });
      if (!managerBranch || item.category.branchId !== managerBranch.branchId) {
        throw new ForbiddenException('You only have permission to update items within your branch scope');
      }
    }

    // 3. إذا قام المستخدم بتحديث الـ categoryId، نتأكد من صلاحيته على الـ Category الجديدة أيضاً
    if (dto.categoryId && dto.categoryId !== item.categoryId) {
      const newCategory = await this.findCategoryInternal(dto.categoryId);
      await this.assertRestaurantAccess(newCategory.restaurantId, currentUser);
      
      if (currentUser.role === Role.BRANCH_MANAGER && newCategory.branchId !== item.category.branchId) {
        throw new ForbiddenException('Cannot move item to a category outside your branch scope');
      }
    }

    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  // ── 🚫 حذف عنصر منيو (Soft Delete) ──
  async deleteItem(id: string, currentUser: any) {
    const item = await this.findItem(id);

    // جدار حماية: المالك والسوبر أدمن فقط (بناءً على الـ Roles في الكنترولر)
    await this.assertRestaurantAccess(item.category.restaurantId, currentUser);

    return this.prisma.menuItem.update({ 
      where: { id }, 
      data: { isActive: false } 
    });
  }

  // ── Branch-level overrides ────────────────

 // ── 🎛️ تعديل أسعار أو توافر الوجبة لفرع محدد ──
  async setBranchOverride(dto: BranchMenuOverrideDto, currentUser: any) {
    // 1. جلب الفرع والوجبة معاً للتأكد من وجودهما والوقوف على أرض صلبة
    const [branch, menuItem] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
      this.findItem(dto.menuItemId), // دالتنا السابقة الجاهزة التي تجلب الوجبة مع الـ category
    ]);

    if (!branch) throw new NotFoundException('Branch not found');

    // 2. جدار الحماية للمطعم: هل يمتلك المستخدم الصلاحية على هذا المطعم المستهدف؟
    await this.assertRestaurantAccess(branch.restaurantId, currentUser);
    await this.assertRestaurantAccess(menuItem.category.restaurantId, currentUser);

    // 3. جدار الحماية لمدير الفرع: هل هذا الفرع هو فرعه الشخصي المعين عليه؟
    if (currentUser.role === Role.BRANCH_MANAGER) {
      const managerBranch = await this.prisma.branchUser.findFirst({
        where: { userId: currentUser.id, branchId: dto.branchId }
      });
      if (!managerBranch) {
        throw new ForbiddenException('Branch managers can only override items within their assigned branch');
      }
    }

    // التنفيذ الآمن بعد عبور الجمارك الأمنية بنجاح 
    return this.prisma.branchMenuItem.upsert({
      where: { branchId_menuItemId: { branchId: dto.branchId, menuItemId: dto.menuItemId } },
      update: { price: dto.price, isAvailable: dto.isAvailable },
      create: {
        branchId: dto.branchId,
        menuItemId: dto.menuItemId,
        price: dto.price,
        isAvailable: dto.isAvailable ?? true,
      },
    });
  }

  // ── 📋 جلب منيو فرع محدد بالكامل مع الأسعار المعدلة ──
// ── 📋 جلب منيو فرع محدد بالكامل مع الأسعار المعدلة ──
  async getBranchMenu(branchId: string, currentUser: any) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { restaurantId: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    // 1. جدار حماية لمنع تسريب المنيو الخاص بالمطاعم الأخرى
    await this.assertRestaurantAccess(branch.restaurantId, currentUser);

    // 2. 🛡️ جدار حماية لمدير الفرع والنادل (BRANCH_MANAGER & WAITER)
    // نتحقق أن المستخدم (سواء كان مديراً أو نادلاً) مربوط فعلياً بهذا الفرع المحدد
    if (currentUser.role === Role.BRANCH_MANAGER || currentUser.role === Role.CASHIER) {
      const isUserAssignedToBranch = await this.prisma.branchUser.findFirst({
        where: { 
          userId: currentUser.id, 
          branchId: branchId 
        }
      });
      
      // إذا لم يكن النادل أو المدير مربوطاً بهذا الفرع، يتم صده فوراً
      if (!isUserAssignedToBranch) {
        throw new ForbiddenException('You do not have permission to view this branch menu');
      }
    }

    return this.findItems({ restaurantId: branch.restaurantId, branchId, page: 1, limit: 200, skip: 0 } as any);
  }
}