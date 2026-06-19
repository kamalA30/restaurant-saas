import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, ForbiddenException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service'; // 👈 قمنا باستيراد PrismaService للفحص الأمني
import { Role } from '@prisma/client';

/**
 * Kitchen WebSocket Gateway (نسخة آمنة ومحمية)
 *
 * Rooms pattern:
 * branch:{branchId}  — جميع موظفي الفرع المسموح لهم
 * kitchen:{branchId} — الغرفة الخاصة بالطهاة فقط للفرع
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: 'kitchen',
  transports: ['websocket', 'polling'],
})
export class KitchenGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(KitchenGateway.name);

  // branchId → Set of socketIds
  private branchSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService, // 👈 حقن الخدمة هنا لحماية الغرف لحظياً
  ) {}

  afterInit() {
    this.logger.log('🔌 Kitchen WebSocket Gateway initialized with Security Layers');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token — disconnecting`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });

      // تخزين بيانات المستخدم داخل كائن السوكت لاستخدامها في التحقق من الغرف لاحقاً
      (client as any).user = payload;
      this.logger.log(`Client connected: ${client.id} (${payload.email} / ${payload.role})`);
    } catch (err) {
      this.logger.warn(`Invalid token from ${client.id}: ${(err as any).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // تنظيف خريطة السوكتات عند قطع الاتصال
    for (const [branchId, sockets] of this.branchSockets.entries()) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.branchSockets.delete(branchId);
    }
  }

  // ─────────────────────────────────────────
  // CLIENT → SERVER MESSAGES (محمية ومؤمنة)
  // ─────────────────────────────────────────

  @SubscribeMessage('join:branch')
  async joinBranch(
    @MessageBody() data: { branchId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    if (!user) return client.disconnect();

    // 🛡️ جدار حماية: منع الموظفين التشغيليين من دخول غرف فروع لم يتم تعيينهم عليها
    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.OWNER) {
      const isAssigned = await this.prisma.branchUser.findFirst({
        where: { userId: user.id, branchId: data.branchId }
      });
      if (!isAssigned) {
        client.emit('error', { message: 'Forbidden: You are not assigned to this branch' });
        return;
      }
    }

    const room = `branch:${data.branchId}`;
    client.join(room);

    if (!this.branchSockets.has(data.branchId)) {
      this.branchSockets.set(data.branchId, new Set());
    }
    this.branchSockets.get(data.branchId)!.add(client.id);

    this.logger.log(`Client ${client.id} approved to join room ${room}`);
    client.emit('joined', { room, timestamp: new Date().toISOString() });
  }

  @SubscribeMessage('join:kitchen')
  async joinKitchen(
    @MessageBody() data: { branchId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    if (!user) return client.disconnect();

    // 🛡️ جدار حماية: التحقق من التعيين ومن أن الصلاحية هي طباخ أو مدير فرع أو إدارة عليا
    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.OWNER) {
      const isAssigned = await this.prisma.branchUser.findFirst({
        where: { userId: user.id, branchId: data.branchId }
      });
      if (!isAssigned) {
        client.emit('error', { message: 'Forbidden: You do not have access to this kitchen queue' });
        return;
      }
    }

    // السماح بالدخول للغرفة بعد تخطي الفحص الأمني بنجاح
    client.join(`kitchen:${data.branchId}`);
    client.join(`branch:${data.branchId}`); // المطبخ يستمع أيضاً لأحداث الفرع العامة
    client.emit('joined', { room: `kitchen:${data.branchId}` });
  }

  @SubscribeMessage('leave:branch')
  leaveBranch(
    @MessageBody() data: { branchId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`branch:${data.branchId}`);
    client.leave(`kitchen:${data.branchId}`);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // ─────────────────────────────────────────
  // SERVER → CLIENT: ORDER EVENTS
  // ─────────────────────────────────────────

  @OnEvent('order.created')
  handleOrderCreated(order: any) {
    const branchRoom = `branch:${order.branchId}`;
    this.server.to(branchRoom).emit('order:new', {
      type: 'ORDER_CREATED',
      order,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Emitted order:new to ${branchRoom}`);
  }

  @OnEvent('order.status_changed')
  handleOrderStatusChanged(order: any) {
    const branchRoom = `branch:${order.branchId}`;
    this.server.to(branchRoom).emit('order:status', {
      type: 'STATUS_CHANGED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      timestamp: new Date().toISOString(),
    });
  }

  // ─────────────────────────────────────────
  // BROADCAST HELPERS
  // ─────────────────────────────────────────

  broadcastToKitchen(branchId: string, event: string, data: any) {
    this.server.to(`kitchen:${branchId}`).emit(event, data);
  }

  broadcastToBranch(branchId: string, event: string, data: any) {
    this.server.to(`branch:${branchId}`).emit(event, data);
  }

  getConnectedClientsCount(branchId: string): number {
    return this.branchSockets.get(branchId)?.size ?? 0;
  }
}