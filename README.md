# Restaurant SaaS — Backend API

A production-ready, multi-tenant restaurant management system built with NestJS, PostgreSQL, and Prisma ORM.

## Architecture Overview

```
CLIENT LAYER (Dashboard / POS / Kitchen Display / Mobile)
         │ REST + WebSocket
NESTJS API GATEWAY
  JWT Guard → Roles Guard → Rate Limit → Validation Pipe
         │
  ┌──────┼──────────┬──────────┬──────────┬──────────┐
Auth  Users     Restaurants  Menu    Orders  Analytics
  └──────┴──────────┴──────────┴──────────┴──────────┘
         │
  PRISMA ORM LAYER (Type-safe · Migrations · Pool)
         │
  POSTGRESQL 16 (Multi-tenant · UUID · Indexes)
         │
  WEBSOCKET LAYER (Kitchen Gateway · Branch rooms)
         │
  AI AGENT LAYER (Future: LangChain tools → GPT-4o)
```

## Project Structure

```
restaurant-saas/
├── prisma/
│   ├── schema.prisma              # Complete DB schema (12 models)
│   └── seed.ts                    # Demo data seeder
├── docker/
│   └── postgres/init.sql          # PostgreSQL extensions
├── src/
│   ├── main.ts                    # Bootstrap + Swagger
│   ├── app.module.ts              # Root module
│   ├── config/
│   │   ├── app.config.ts
│   │   └── jwt.config.ts
│   ├── prisma/
│   │   ├── prisma.service.ts      # DB client + lifecycle hooks
│   │   └── prisma.module.ts       # Global module
│   ├── auth/
│   │   ├── auth.service.ts        # Register/Login/Refresh/Logout
│   │   ├── auth.controller.ts
│   │   ├── dto/auth.dto.ts
│   │   ├── strategies/
│   │   │   ├── jwt-access.strategy.ts
│   │   │   └── jwt-refresh.strategy.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts  # Global — use @Public() to opt out
│   │   │   └── roles.guard.ts     # Hierarchical RBAC
│   │   └── decorators/
│   │       └── public.decorator.ts
│   ├── users/
│   │   ├── users.service.ts       # CRUD + branch assignment
│   │   ├── users.controller.ts
│   │   └── dto/users.dto.ts
│   ├── restaurants/
│   │   ├── restaurants.service.ts # Restaurant + Branch management
│   │   ├── restaurants.controller.ts
│   │   └── dto/restaurants.dto.ts
│   ├── menu/
│   │   ├── menu.service.ts        # Categories + Items + Branch price overrides
│   │   ├── menu.controller.ts
│   │   └── dto/menu.dto.ts
│   ├── orders/
│   │   ├── orders.service.ts      # Full lifecycle + state machine + EventEmitter
│   │   ├── orders.controller.ts
│   │   └── dto/orders.dto.ts
│   ├── kitchen/
│   │   ├── kitchen.gateway.ts     # Socket.IO WebSocket gateway + JWT auth
│   │   ├── kitchen.service.ts     # Queue management
│   │   └── kitchen.controller.ts
│   ├── analytics/
│   │   ├── analytics.service.ts   # 7 AI-ready data methods
│   │   ├── analytics.controller.ts
│   │   └── dto/analytics.dto.ts
│   ├── ai-agent/
│   │   └── ai-agent.scaffold.ts   # LangChain/LangGraph integration blueprint
│   └── common/
│       ├── decorators/            # @CurrentUser, @Roles
│       ├── filters/               # HttpExceptionFilter
│       ├── interceptors/          # Transform + Logging
│       ├── pagination/            # PaginationDto + paginate()
│       └── utils/                 # Winston logger
├── .env.example
├── docker-compose.yml
└── Dockerfile                     # Multi-stage (dev + production)
```

## Quick Start

### 1. Install

```bash
npm install
cp .env.example .env
# Edit .env with your values
```

### 2. Docker (recommended)

```bash
# Start PostgreSQL + Redis
docker-compose up -d postgres redis

# Run DB migrations
npm run db:migrate

# Seed demo data
npm run db:seed

# Start dev server (hot reload)
npm run start:dev
```

### 3. Full Docker Stack

```bash
docker-compose up -d
# API:           http://localhost:3000/api/v1
# Swagger docs:  http://localhost:3000/docs
# Prisma Studio: docker-compose --profile tools up prisma-studio
```

## Authentication

```
POST /api/v1/auth/register  → { accessToken, refreshToken, user }
POST /api/v1/auth/login     → { accessToken, refreshToken, user }
POST /api/v1/auth/refresh   → { accessToken, refreshToken, user }  ← token rotation
POST /api/v1/auth/logout    → 204 No Content
POST /api/v1/auth/me        → current user
```

- Access token: 15-minute JWT (Bearer header)
- Refresh token: 7-day JWT with rotation — every refresh revokes the old token
- All routes are protected globally — use @Public() decorator to opt out

## Role Hierarchy

```
SUPER_ADMIN  (100)  full system access
  └── OWNER        (80)   their restaurant + branches
       └── BRANCH_MANAGER (60)   one branch
               ├── CASHIER (40)  create orders
               └── CHEF    (40)  update kitchen status
```

Higher-level roles satisfy lower-level checks automatically (SUPER_ADMIN passes any @Roles check).

## API Reference

### Auth
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | /auth/register | Public |
| POST | /auth/login | Public |
| POST | /auth/refresh | Public (refresh token) |
| POST | /auth/logout | Authenticated |
| POST | /auth/me | Authenticated |

### Restaurants & Branches
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /restaurants | SUPER_ADMIN |
| POST | /restaurants | SUPER_ADMIN |
| GET | /restaurants/:id | OWNER+ |
| PATCH | /restaurants/:id | OWNER+ |
| GET | /branches/restaurant/:id | MANAGER+ |
| POST | /branches | OWNER+ |
| PATCH | /branches/:id | OWNER+ |
| DELETE | /branches/:id | OWNER+ |

### Menu
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /menu/categories?restaurantId= | All |
| POST | /menu/categories | MANAGER+ |
| GET | /menu/items?categoryId=&branchId= | All |
| POST | /menu/items | MANAGER+ |
| GET | /menu/branch/:branchId | All |
| POST | /menu/branch-override | MANAGER+ |

### Orders
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | /orders | CASHIER+ |
| GET | /orders?branchId=&status=&dateFrom=&dateTo= | Role-scoped |
| GET | /orders/:id | Authenticated |
| PATCH | /orders/:id/status | Role-restricted state machine |
| PATCH | /orders/:id/cancel | Authenticated |
| GET | /orders/kitchen-queue/:branchId | CHEF+ |

### Kitchen
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /kitchen/queue/:branchId | CHEF+ |
| GET | /kitchen/stats/:branchId | CHEF+ |
| PATCH | /kitchen/:orderId/preparing | CHEF, MANAGER |
| PATCH | /kitchen/:orderId/ready | CHEF, MANAGER |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /analytics/summary | Order totals, revenue, avg value |
| GET | /analytics/top-items | Best-selling items by revenue |
| GET | /analytics/branch-sales | Cross-branch comparison |
| GET | /analytics/revenue-trend | Daily revenue over period |
| GET | /analytics/peak-hours | Busiest hours of the day |
| GET | /analytics/low-performers | Items candidates for removal |
| GET | /analytics/snapshot | Full report (AI agent primary endpoint) |

Analytics query params: `period=week|today|month|quarter|year|custom`, `dateFrom`, `dateTo`, `branchId`, `restaurantId`, `limit`

## WebSocket — Kitchen Gateway

Namespace: `ws://localhost:3000/kitchen`

```javascript
// Connect with JWT
const socket = io('http://localhost:3000/kitchen', {
  auth: { token: 'your-jwt-access-token' }
});

// Join your branch room
socket.emit('join:branch',  { branchId: 'uuid' });
socket.emit('join:kitchen', { branchId: 'uuid' }); // chefs only

// Listen for order events
socket.on('order:new',      (data) => { /* new order placed by cashier */ });
socket.on('order:status',   (data) => { /* status changed */ });
socket.on('order:preparing',(data) => { /* chef started cooking */ });
socket.on('order:ready',    (data) => { /* notify cashier to collect */ });
```

Room pattern: `branch:{branchId}` (all staff) and `kitchen:{branchId}` (chefs only).

## Order State Machine

```
PENDING → PREPARING → READY → COMPLETED
    └──────────┴──────────┴──► CANCELLED
```

Role restrictions:
- CASHIER: Cannot set PREPARING; can cancel PENDING; can complete READY
- CHEF: Can only set PREPARING or READY
- MANAGER+: Full transition access

## AI Agent Integration (Future)

All 7 AnalyticsService methods are designed as independent LangChain tools:

```typescript
// Future: src/ai-agent/tools/analytics.tool.ts
const snapshotTool = new DynamicStructuredTool({
  name: 'get_full_analytics_snapshot',
  description: 'Full restaurant performance report: top items, branch sales, peak hours, low performers.',
  schema: z.object({ restaurantId: z.string().uuid(), period: z.enum(['week','month','today']) }),
  func: async (input) => JSON.stringify(await analyticsService.getFullSnapshot(input)),
});

// Agent query example:
// User: "Why is Hamburg underperforming this week?"
// Agent: calls getFullSnapshot + getPeakHours + getTopSellingItems
//      → synthesizes: "Hamburg has 23% fewer orders. Avg prep time 28min vs 15min for Mitte."
```

See `src/ai-agent/ai-agent.scaffold.ts` for full LangGraph workflow blueprint.

## Multi-Tenancy Model

Shared database with tenant isolation enforced at the service layer:
- Every tenant-owned record has `restaurantId` or is reachable via `branchId → restaurantId`
- Owners see only their restaurant's data (service-layer check)
- SUPER_ADMIN bypasses all tenant checks
- Future: PostgreSQL Row-Level Security (RLS) for database-level isolation

## Database Design Highlights

| Decision | Rationale |
|----------|-----------|
| UUID PKs | No sequential ID leakage; multi-tenant safe |
| BranchMenuItem override table | Branch pricing without duplicating menu items |
| OrderItem.unitPrice snapshot | Preserves price at order time — history survives menu changes |
| Order status timestamps | Enables exact prep-time analytics and SLA tracking |
| DailySalesSnapshot table | Pre-aggregated for fast AI queries on historical data |
| RefreshToken table | Token rotation with audit trail and revocation |
| Soft deletes (isActive) | Preserves referential integrity and order history |

## Environment Variables

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/restaurant_saas
JWT_ACCESS_SECRET=<64-char-random>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<64-char-different-random>
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGINS=https://dashboard.yourdomain.de
THROTTLE_TTL=60
THROTTLE_LIMIT=100
LOG_LEVEL=info
OPENAI_API_KEY=          # future AI agent
```

## Docker Commands

```bash
docker-compose up -d                    # start all services
docker-compose logs -f api              # follow logs
npm run db:migrate                      # dev migrations
npm run db:migrate:prod                 # production migrations (deploy only)
npm run db:seed                         # seed demo data
npm run db:reset                        # drop + recreate (dev only!)
docker build --target production -t restaurant-api .  # production image
```

## Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@system.de | Admin@1234 |
| Owner | owner@beirutkitchen.de | Owner@1234 |
| Branch Manager | manager.mitte@beirutkitchen.de | Manager@1234 |
| Cashier | cashier1@beirutkitchen.de | Cashier@1234 |
| Chef | chef1@beirutkitchen.de | Chef@1234 |

## Scalability Path

```
Phase 1 (current):  NestJS monolith → PostgreSQL
Phase 2:            + Redis (cache/pub-sub) + read replicas
Phase 3:            Microservices (auth, orders, analytics separated)
Phase 4:            CQRS + Event Sourcing for orders module
                    Event store → Analytics projections (Kafka)
```

## Security Checklist

- [x] JWT short-lived access tokens + rotating refresh tokens
- [x] bcrypt password hashing (12 rounds)
- [x] Helmet.js HTTP security headers
- [x] CORS explicit whitelist
- [x] Rate limiting per IP
- [x] Input validation (whitelist + forbidNonWhitelisted)
- [x] RBAC with hierarchy
- [x] Soft deletes (no orphaned data)
- [x] Prisma parameterized queries (SQL injection safe)
- [x] WebSocket JWT authentication on connect
- [ ] TODO: PostgreSQL RLS for tenant isolation at DB level
- [ ] TODO: Secrets manager (AWS/Vault) instead of env files
- [ ] TODO: API key for AI agent service-to-service auth

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | orders.service.ts |
| Classes | PascalCase | OrdersService |
| Methods | camelCase | getKitchenQueue() |
| DB tables | snake_case (Prisma @@map) | order_items |
| Env vars | SCREAMING_SNAKE | JWT_ACCESS_SECRET |
| API routes | kebab-case | /branch-sales |
| WS events | colon-separated | order:status |
| DTO suffix | Dto | CreateOrderDto |
| Guard suffix | Guard | JwtAuthGuard |

Built with NestJS · PostgreSQL · Prisma · Socket.IO · Winston
