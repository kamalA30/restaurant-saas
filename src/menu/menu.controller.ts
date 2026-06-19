import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MenuService } from './menu.service';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateMenuItemDto, UpdateMenuItemDto,
  BranchMenuOverrideDto, MenuQueryDto,
} from './dto/menu.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Menu')
@ApiBearerAuth('access-token')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}


// ── Categories ────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'List categories for a restaurant (and optionally filter by branch)' })
  findCategories(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('branchId') branchId?: string, // إضافة الـ branchId كمعامل اختياري
  ) {
    return this.menuService.findCategories(restaurantId, branchId);
  }

  @Get('categories/:id')
  findCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.findCategory(id);
  }
@Post('categories')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create a new category with strict scope validation' })
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() currentUser: any // 👈 تمرير كائن المستخدم بالكامل لقراءة الصلاحيات
  ) {
    return this.menuService.createCategory(dto, currentUser);
  }

  @Patch('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Update category with tenant protection' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() currentUser: any
  ) {
    return this.menuService.updateCategory(id, dto, currentUser);
  }

  @Delete('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Soft delete category (Owner & SuperAdmin only)' })
  deleteCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any
  ) {
    return this.menuService.deleteCategory(id, currentUser);
  }

  // ── Menu Items ────────────────────────────

  @Get('items')
  @ApiOperation({ summary: 'List menu items (filterable by category, branch, availability)' })
  findItems(@Query() query: MenuQueryDto) {
    return this.menuService.findItems(query);
  }

  @Get('items/:id')
  findItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.findItem(id);
  }
@Post('items')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create a new menu item with tenant validation' })
  createItem(
    @Body() dto: CreateMenuItemDto,
    @CurrentUser() currentUser: any // 👈 تمرير كائن المستخدم بالكامل لقراءة الصلاحيات
  ) {
    return this.menuService.createItem(dto, currentUser);
  }

  @Patch('items/:id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Update menu item with isolation checks' })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() dto: UpdateMenuItemDto,
    @CurrentUser() currentUser: any
  ) {
    return this.menuService.updateItem(id, dto, currentUser);
  }

  @Delete('items/:id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Soft delete menu item' })
  deleteItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any
  ) {
    return this.menuService.deleteItem(id, currentUser);
  }

  // ── Branch overrides ──────────────────────

@Get('branch/:branchId')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER , Role.WAITER) // 🛡️ قفل الرابط بالصلاحيات
  @ApiOperation({ summary: 'Get complete menu for a specific branch (with price overrides)' })
  getBranchMenu(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() currentUser: any // 👈 تمرير المستخدم الحلي للتحقق من تبعية الفرع
  ) {
    return this.menuService.getBranchMenu(branchId, currentUser);
  }

  @Post('branch-override')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER , Role.WAITER)
  @ApiOperation({ summary: 'Set branch-specific price or availability for a menu item' })
  setBranchOverride(
    @Body() dto: BranchMenuOverrideDto,
    @CurrentUser() currentUser: any // 👈 تمرير المستخدم لحماية الـ Override
  ) {
    return this.menuService.setBranchOverride(dto, currentUser);
  }
}
