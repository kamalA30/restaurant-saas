// This stub is only needed during CI/build without a live DB.
// When `prisma generate` runs (with DB), @prisma/client exports these natively.
declare module '@prisma/client' {
  export enum Role {
    SUPER_ADMIN = 'SUPER_ADMIN',
    OWNER = 'OWNER',
    BRANCH_MANAGER = 'BRANCH_MANAGER',
    CASHIER = 'CASHIER',
    CHEF = 'CHEF',
    WAITER = 'WAITER' ,
  }
  export enum OrderStatus {
    PENDING = 'PENDING',
    PREPARING = 'PREPARING',
    READY = 'READY',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
  }
  export enum PaymentMethod {
    CASH = 'CASH',
    CARD = 'CARD',
    ONLINE = 'ONLINE',
  }
  export enum PaymentStatus {
    PENDING = 'PENDING',
    PAID = 'PAID',
    REFUNDED = 'REFUNDED',
  }
  export class PrismaClient {
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $transaction(fn: (tx: any) => Promise<any>): Promise<any>;
    $on(event: string, cb: (e: any) => void): void;
    $executeRawUnsafe(query: string): Promise<any>;
    $queryRaw<T = any>(query: TemplateStringsArray, ...values: any[]): Promise<T>;
    user: any;
    restaurant: any;
    branch: any;
    branchUser: any;
    category: any;
    menuItem: any;
    branchMenuItem: any;
    order: any;
    orderItem: any;
    refreshToken: any;
    dailySalesSnapshot: any;
    auditLog: any;
  }
}
