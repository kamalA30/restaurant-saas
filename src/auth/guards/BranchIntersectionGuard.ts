import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service'; // تأكد من مسار الـ PrismaService الصحيح في مشروعك

@Injectable()
export class BranchIntersectionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // يتم التقاط المستخدم هنا بعد مروره من الـ JwtAuthGuard

    // 1. التحقق من وجود المستخدم وصلاحيته الأساسية
    if (!user) {
      throw new ForbiddenException('User authentication required');
    }

    // 2. المالك والمشرف العام يمرون تلقائياً دون قيود الفروع
    if (user.role === 'SUPER_ADMIN' || user.role === 'OWNER') {
      return true;
    }

    // 3. استخراج الـ branchId من الطلب (سواء كان في الرابط Param، أو استعلام Query، أو في الجسم Body)
    const branchId =
      request.params.branchId ||
      request.query.branchId ||
      request.body.branchId;

    if (!branchId) {
      throw new BadRequestException('Branch ID is required for this resource');
    }

    // 4. التحقق في قاعدة البيانات: هل هذا الموظف مسجل فعلياً في هذا الفرع بالذات؟
    const hasAccess = await this.prisma.branchUser.findUnique({
      where: {
        branchId_userId: {
          branchId: branchId,
          userId: user.id,
        },
      },
    });

    // 5. إذا لم يجد سجل يربطهما، يمنع الدخول فوراً لحماية البيانات (منع ثغرة BOLA)
    if (!hasAccess) {
      throw new ForbiddenException(
        'Access denied: You are not assigned to this branch',
      );
    }

    return true;
  }
}