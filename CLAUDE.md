# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev       # Watch mode (recommended for local dev)
npm run start:debug     # Debug mode with inspector

# Build & Production
npm run build           # Compile TypeScript to dist/
npm run start:prod      # Run compiled output

# Testing
npm test                # Run all unit tests
npm run test:watch      # Tests in watch mode
npm run test:cov        # Tests with coverage report
npm run test:e2e        # End-to-end tests
npm test -- --testPathPattern=auth   # Run a single test file by pattern

# Code Quality
npm run lint            # Fix lint issues
npm run lint:check      # Check without fixing
npm run format          # Prettier format
```

## Architecture Overview

ServixOS is a **multi-tenant SaaS backend** for service businesses (scheduling, invoicing, employee management). It's built with NestJS + MongoDB (Typegoose) + Redis.

### Module Structure

Feature modules live in `src/modules/` and follow a consistent pattern:

```
modules/<feature>/
  *.module.ts        — NestJS module definition
  *.service.ts       — Business logic
  *.controller.ts    — HTTP handlers
  *.repository.ts    — Data access (Typegoose models)
  schemas/           — Mongoose/Typegoose schema classes
  dto/               — Validated request/response shapes
```

Current modules: `auth`, `users`, `business`, `business-categories`, `roles`, `employees`, `email`, `redis`, `website`.

### Multi-Tenancy

Every authenticated request carries a `x-business-id` header. The `TenantGuard` validates this matches the `businessId` in the JWT payload and that the business is active. All data access is scoped to `businessId` — compound unique indexes (e.g., `[businessId, email]`) enforce per-tenant isolation.

### Request Lifecycle & Guard Order

Guards execute in this order on protected routes:
1. **JwtAuthGuard** — validates Bearer token; skipped on routes with `@Public()`
2. **TenantGuard** — checks `x-business-id` header against JWT claim and business status
3. **PermissionsGuard** — enforces `@Permissions(...permission)` on routes
4. **SubscriptionGuard** — enforces `@RequirePlan(feature)` minimum plan tier

### Response Shape

All responses are wrapped by `ResponseTransformInterceptor`:

```typescript
{
  success: boolean,
  statusCode: number,
  message: string,
  data?: T,
  meta?: { page, limit, total, totalPages }
}
```

Error messages come from `src/common/constants/messages/` — use these constants rather than inline strings.

### Authentication Flow

- Short-lived JWT access tokens (configurable via `JWT_EXPIRES_IN`)
- Refresh tokens stored hashed (SHA-256) in MongoDB with a TTL index for auto-expiry
- JWT payload shape: `{ sub: userId, businessId, userRole, pinVerified }`
- Password hashing: bcrypt with 12 salt rounds (`src/common/utils/hash.util.ts`)

### Subscription & RBAC

**Subscription tiers** (in order): `starter → growth → pro`. Feature gating via `FEATURE_PLAN_MAP` in `src/common/constants/subscription.constants.ts`.

**RBAC** uses 40+ granular permissions (e.g., `clients:view`, `jobs:create`). Three system roles exist per business: `Owner` (all permissions), `Manager`, `Employee`. Custom roles are also supported.

**Decorators:**
- `@Public()` — skip JWT auth
- `@CurrentUser()` — inject JWT payload into handler
- `@Permissions(...perms)` — require specific permissions
- `@RequirePlan(feature)` — gate by subscription tier
- `@Encrypt()` — enable AES-256-GCM request/response encryption

### Schema Definitions (Typegoose)

Schemas use class-based Typegoose decorators, not plain Mongoose objects. Example:

```typescript
@modelOptions({ schemaOptions: { collection: 'users', timestamps: true } })
export class User {
  @prop({ required: true, unique: true })
  email!: string;
}
export const UserModel = getModelForClass(User);
```

Schemas are in `src/modules/<feature>/schemas/`. Key models: `User`, `Business`, `RefreshToken`, `Employee`, `Role`, `BusinessCategory`.

### Configuration

All config uses `@nestjs/config` with `registerAs()` namespaces in `src/config/`. Required environment variables:

```
DATABASE_URL          — MongoDB connection string
JWT_SECRET            — JWT signing secret
JWT_EXPIRES_IN        — Access token TTL (e.g. 15m)
REDIS_URL             — Redis connection URL
ENCRYPTION_SECRET     — 64-char hex for AES-256-GCM
ENCRYPTION_IV         — Initialization vector
API_KEY               — Static API key for ApiKeyGuard
PORT                  — HTTP server port
NODE_ENV              — development | production
```

### Encryption

`@Encrypt()` on a controller enables full payload encryption. `DecryptionMiddleware` unwraps incoming requests; `EncryptionInterceptor` wraps outgoing responses. Algorithm: AES-256-GCM with 12-byte IV and 16-byte auth tag.

### Testing

Tests use Jest with `ts-jest`. Unit test files are co-located (`*.spec.ts`). E2E tests live in `test/`. No database mocking convention is established yet — integration tests should use a real test MongoDB instance.
