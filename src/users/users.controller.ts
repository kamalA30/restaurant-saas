import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, AssignBranchDto, UsersQueryDto } from './dto/users.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Create a new user (Strict Tenant Isolation)' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: any // تمرير كائن المستخدم بالكامل لقراءة الصلاحيات والمطعم
  ) {
    return this.usersService.create(dto, currentUser);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'List users with multi-level access control' })
  findAll(
    @Query() query: UsersQueryDto,
    @CurrentUser('restaurantId') userRestaurantId: string,
    @CurrentUser('role') userRole: Role,
    @CurrentUser('id') userId: string
  ) {
    return this.usersService.findAll(query, userRestaurantId, userRole, userId);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('restaurantId') userRestaurantId: string,
    @CurrentUser('role') userRole: Role,
    @CurrentUser('id') userId: string
  ) {
    return this.usersService.findOne(id, userRestaurantId, userRole, userId);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Update user data with protection' })
  update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: any
  ) {
    return this.usersService.update(id, dto, currentUser);
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Deactivate a user (Soft Delete)' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any
  ) {
    return this.usersService.deactivate(id, currentUser);
  }

  @Post('assign-branch')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Assign user to a specific branch' })
  assignToBranch(
    @Body() dto: AssignBranchDto,
    @CurrentUser() currentUser: any
  ) {
    return this.usersService.assignToBranch(dto, currentUser);
  }

  @Delete(':userId/branches/:branchId')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Remove user from a branch' })
  removeFromBranch(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: any
  ) {
    return this.usersService.removeFromBranch(branchId, userId, currentUser);
  }
}