import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RestaurantsService } from './restaurants.service';
import {
  CreateRestaurantDto, UpdateRestaurantDto,
  CreateBranchDto, UpdateBranchDto, RestaurantsQueryDto,
} from './dto/restaurants.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
// أضف هذا السطر في أعلى ملف الكنترولر مع الـ imports الأخرى
import { UsersQueryDto } from '../users/dto/users.dto';
@ApiTags('Restaurants')
@ApiBearerAuth('access-token')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  /** 
  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all restaurants (super admin)' })
  findAll(@Query() query: RestaurantsQueryDto) {
    return this.restaurantsService.findAllRestaurants(query);
  } 
  */

@Get()
@Roles(Role.SUPER_ADMIN, Role.OWNER)
@ApiOperation({ summary: 'List restaurants with multi-level access control' })
findAll(
  @Query() query: RestaurantsQueryDto, // 👈 استقبال فلاتر المطاعم
  @CurrentUser('restaurantId') userRestaurantId: string, 
  @CurrentUser('role') userRole: Role
) {
  // تمرير معطيات الأمان إلى الدالة الصحيحة في السيرفيس
  return this.restaurantsService.findAllRestaurants(query, userRestaurantId, userRole);
}
  /**
@Get(':id')
@Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
  // نقوم بتمرير الـ id و الـ user الموجود في الـ request
  return this.restaurantsService.findRestaurant(id, req.user);
}
 */
 
@Get(':id')
//@UseGuards(JwtAuthGuard, RolesGuard) // 👈 قفل الأمان الحاسم: بدونه لن يقرأ التوكن ولن يطبع الـ console.log
@Roles(Role.SUPER_ADMIN, Role.OWNER)
findOne(
  @Param('id', ParseUUIDPipe) id: string, 
  @CurrentUser('restaurantId') userRestaurantId: string, 
  @CurrentUser('role') userRole: Role 
) {
  console.log("🚀 تم الدخول بنجاح إلى كنترولر المطاعم!");
  return this.restaurantsService.findRestaurant(id, userRestaurantId, userRole);
}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new restaurant' })
  create(@Body() dto: CreateRestaurantDto, @CurrentUser('id') ownerId: string) {
    return this.restaurantsService.createRestaurant(dto, ownerId);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRestaurantDto,
    @CurrentUser() user: any,
  ) {
    return this.restaurantsService.updateRestaurant(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantsService.deleteRestaurant(id);
  }
}

@ApiTags('Branches')
@ApiBearerAuth('access-token')
@Controller('branches')
export class BranchesController {
  constructor(private readonly restaurantsService: RestaurantsService) {}


 @Get('restaurant/:restaurantId')
@Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
async getBranches(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @Query() query: RestaurantsQueryDto,
  // 🔽 قمنا بتغيير النص داخل الـ Decorator هنا ليقرأ الحقل الصحيح من التوكن
  @CurrentUser('restaurantId') tokenRestaurantId: string, 
  @CurrentUser('role') userRole: Role,
  @CurrentUser('id') userId: string
) {
  // نمرر القيمة الصحيحة المأخوذة من التوكن إلى دالة السيرفيس
  return this.restaurantsService.findBranches(restaurantId, query, tokenRestaurantId, userRole, userId);
}

@Get(':id')
@Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
@ApiOperation({ summary: 'Get branch by ID with strict access control' })
async findOne(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser('restaurantId') userRestaurantId: string,
  @CurrentUser('role') userRole: Role,
  @CurrentUser('id') userId: string
) {
  return this.restaurantsService.findBranch(id, userRestaurantId, userRole, userId);
}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  create(@Body() dto: CreateBranchDto, @CurrentUser() user: any) {
    return this.restaurantsService.createBranch(dto, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: any,
  ) {
    return this.restaurantsService.updateBranch(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.restaurantsService.deleteBranch(id, user);
  }
}
