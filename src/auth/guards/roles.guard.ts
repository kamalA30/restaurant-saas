import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

// Role hierarchy: higher index = more permissions
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 100,
  [Role.OWNER]: 80,
  [Role.BRANCH_MANAGER]: 60,
  [Role.CASHIER]: 40,
  [Role.CHEF]: 40,
  [Role.WAITER]: 30, // 🌟 تم إضافة النادل هنا لحل خطأ الـ Build وتغطية الـ Record بالكامل
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('No user in request');

    const userLevel = ROLE_HIERARCHY[user.role as Role] ?? 0;
    
    // التحقق التراكمي: هل مستوى المستخدم الحالي أعلى أو يساوي المستوى المطلوب للمسار؟
    const hasRole = requiredRoles.some(
      (role) => userLevel >= ROLE_HIERARCHY[role],
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}