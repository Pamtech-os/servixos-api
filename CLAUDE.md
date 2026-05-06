# CLAUDE.md — Project Intelligence for ServixOS API

## Project Overview

ServixOS API is a **multi-tenant SaaS backend** for service businesses (scheduling, invoicing, employee management, client chat). It is built with **NestJS**, **TypeScript**, **MongoDB** (Typegoose), **Redis** (ioredis), and **Socket.io** for real-time messaging. Validation uses `class-validator` + `class-transformer`. Tests run with **Jest** + `ts-jest`.

## Key Commands

```bash
# Development
npm run start:dev       # Watch mode (recommended for local dev)
npm run start:debug     # Debug mode with inspector

# Build & Production
npm run build           # Compile TypeScript → dist/ (run before pushing)
npm run start:prod      # Run compiled output

# Testing
npm run test:all                      # Run unit + e2e tests (also runs on pre-commit)
npm test                              # Unit tests only
npm run test:e2e                      # E2E / integration tests only
npm run test:watch                    # Unit tests in watch mode
npm run test:cov                      # Unit tests with coverage report
npm test -- --testPathPattern=auth    # Run a single unit test file by pattern

# Code Quality
npm run lint            # Fix lint issues automatically
npm run lint:check      # Check without fixing
npm run format          # Prettier format
```

## Project Structure

```
src/
├── app.module.ts           # Root module — imports, global guards, interceptors
├── main.ts                 # Bootstrap: CORS, pipes, WebSocket adapter, env validation
├── config/                 # registerAs() config namespaces (jwt, redis, cloudinary, websocket…)
├── common/
│   ├── adapters/           # RedisIoAdapter (Socket.io ↔ Redis pub/sub)
│   ├── constants/
│   │   ├── messages/       # All user-facing strings — NEVER use inline strings
│   │   ├── cache-ttl.constants.ts
│   │   └── app.constants.ts
│   ├── decorators/         # @Public(), @CurrentUser(), @Permissions(), @RequirePlan(), @Encrypt()
│   ├── filters/            # AllExceptionsFilter, WsExceptionFilter
│   ├── gateways/           # WsExceptionFilter
│   ├── guards/             # HmacGuard, JwtAuthGuard, TenantGuard, PermissionsGuard, SubscriptionGuard, WsAuthGuard
│   ├── interceptors/       # ResponseTransformInterceptor, EncryptionInterceptor, ActivityLogInterceptor
│   ├── middleware/         # DecryptionMiddleware (disabled)
│   └── utils/              # pagination.util, hash.util, app-logger
└── modules/
    ├── agenda/             # Background job scheduling (Agenda.js)
    ├── auth/               # JWT auth, refresh tokens, PIN, email OTP
    ├── business/           # Business/tenant schema + repository
    ├── business-categories/
    ├── clients/            # Client schema + repository
    ├── email/              # Mailtrap / Mailjet transports
    ├── employees/          # Employee schema, PresenceGateway (/presence namespace)
    ├── jobs/               # Job scheduling per client
    ├── messaging/          # MessagingGateway (/chat), MessagingService, REST history + upload
    ├── redis/              # Global RedisService (ioredis wrapper)
    ├── requests/           # Service request lifecycle + chat integration
    ├── roles/              # RBAC roles + permissions
    ├── security/
    ├── users/              # User schema + repository
    └── website/            # Business website generation
```

Each feature module follows this layout:

```
modules/<feature>/
  *.module.ts       — NestJS module (imports, providers, exports)
  *.service.ts      — Business logic
  *.controller.ts   — HTTP handlers
  *.repository.ts   — Data access (Typegoose, raw Mongoose queries)
  schemas/          — Typegoose schema classes
  dto/              — class-validator DTO classes
```

## Coding Standards

### DTOs & Validation (CRITICAL)

All request bodies, query strings, and params must be validated with **class-validator DTOs**. Do **not** accept raw `any` or unvalidated `req.body`.

Key rules:

- DTOs live in `modules/<feature>/dto/`
- Use decorators from `class-validator` (`@IsString()`, `@IsMongoId()`, `@IsOptional()`, etc.)
- Import `JwtUser` with `import type` when used only as a type in decorated parameters — required by `isolatedModules`
- Return shapes come from `ResponseTransformInterceptor` — never return `{ success, statusCode }` manually
- All error strings **must** come from `src/common/constants/messages/` — no inline error strings
- Pagination: use `resolvePagination()` + `buildMeta()` from `src/common/utils/pagination.util.ts`

Response shape (applied automatically by `ResponseTransformInterceptor`):

```typescript
{
  success: boolean,
  statusCode: number,
  message: string,
  data?: T,
  meta?: { page, limit, total, totalPages }
}
```

### Schemas (Typegoose)

Schemas use **class-based Typegoose decorators** — never plain Mongoose Schema objects.

```typescript
@index({ businessId: 1, email: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'users', timestamps: true } })
export class User {
  _id: Types.ObjectId;   // declare explicitly so TypeScript sees it

  @prop({ required: true, lowercase: true, trim: true })
  email: string;
}
```

- Declare `_id: Types.ObjectId` explicitly on every schema class
- Use compound indexes for multi-tenant uniqueness: `[businessId, email]`
- Soft delete pattern: `deletedAt?: Date` — always filter `{ deletedAt: null }` in queries
- `timestamps: true` adds `createdAt` / `updatedAt` automatically — do not redeclare them

### Multi-Tenancy (CRITICAL)

Every authenticated request carries a `x-business-id` header validated by `TenantGuard`.

- All DB queries **must** be scoped by `businessId`
- Never return data from a different tenant, even if the document ID is valid
- `JwtUser.businessId` is the source of truth — never trust a `businessId` from the request body for auth decisions

### Guard Order

Guards run globally in this order on protected routes:

1. `HmacGuard` — validates `x-signature` on client-portal requests
2. `JwtAuthGuard` — validates Bearer token; skips routes with `@Public()`
3. `TenantGuard` — validates `x-business-id` matches JWT claim and business is active

Per-route guards applied as decorators:

4. `PermissionsGuard` — enforces `@Permissions(...perms)`
5. `SubscriptionGuard` — enforces `@RequirePlan(feature)`

### WebSocket (Socket.io)

Two namespaces:

| Namespace | Purpose |
|-----------|---------|
| `/chat` | Business ↔ client real-time messaging |
| `/presence` | Team online status widget |

Authentication via `WsAuthGuard.authenticate(socket)` — called manually inside `handleConnection`. It verifies the JWT from `socket.handshake.auth.token`, cross-checks `businessId`, and attaches `{ userId, businessId, userRole, senderName }` to `socket.data`.

Room naming: `{businessId}:{clientId}`. Both business and client sockets join the same room.

All WS event names come from the `WsEvent` enum in `src/modules/messaging/messaging.events.ts` — never use raw strings.

### Redis & Caching

- All cache TTLs come from `CACHE_TTL` in `src/common/constants/cache-ttl.constants.ts`
- `RedisService` (global module) wraps ioredis — use its typed methods (`get`, `set`, `hset`, `sadd`, etc.)
- Cache keys follow the pattern: `<domain>:<scope>:<id>` (e.g., `requests:list:version:${businessId}`)
- List caches use a version counter for invalidation via `incr` — do not delete individual list keys

### Testing

Tests use **Jest** with `ts-jest`. Unit tests are co-located (`*.spec.ts`). E2E tests live in `test/`.

Key rules:

- New features and bug fixes **must** include tests
- Unit tests: `src/modules/<feature>/*.spec.ts` — run with `npm test`
- E2E / integration tests: `test/*.e2e-spec.ts` — run with `npm run test:e2e`
- Both suites run together via `npm run test:all`, which is enforced on **pre-commit**
- Integration tests must use a real MongoDB instance via TestContainers — no mocking the DB
- Mock all external services (Anthropic AI, Cloudinary, Agenda, email providers) — never call real services in tests
- Follow AAA pattern (Arrange, Act, Assert)
- Test names: `"should [expected behaviour] when [condition]"`
- Do not share mutable state between tests

### Commits

- Use conventional commits: `<type>(optional scope): <description>`
- Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `perf`, `style`, `build`, `ci`, `revert`
- Imperative mood (`"add"` not `"added"`), no period at end, under 100 characters
- No `console.log()` in committed code — use `AppLogger` or `Logger` from `@nestjs/common`

### Code Style

- ESLint + Prettier handle formatting — run `npm run lint` before committing
- No `any` types — use proper types or `unknown` with a type guard
- TypeScript strict mode is enabled — `npm run build` must pass before pushing
- Always import `JwtUser` with `import type` in files that use it only as a parameter type

## PR Review Checklist

When reviewing a pull request, verify ALL of the following:

### 1. The PR Fixes What It Claims

- Changes actually address the described problem
- Fix is correct and complete — not a band-aid
- No regressions to existing functionality
- Edge cases are handled (not found, already actioned, wrong tenant, etc.)

### 2. DTOs & Validation

- Request bodies use class-validator DTOs — no raw `any` bodies
- `@IsMongoId()` used for ObjectId params, `@IsOptional()` for optional fields
- `JwtUser` imported with `import type` when used only as a decorated parameter type
- Error strings come from `src/common/constants/messages/` — no inline strings
- Pagination uses `resolvePagination()` + `buildMeta()`

### 3. Multi-Tenancy

- Every DB query is scoped by `businessId` from the JWT — not from the request body
- No cross-tenant data leakage possible through the new code
- Soft-delete filter (`deletedAt: null`) applied to all queries

### 4. Schemas

- New Typegoose schema classes declare `_id: Types.ObjectId` explicitly
- Compound indexes added for uniqueness constraints involving `businessId`
- `timestamps: true` used — `createdAt`/`updatedAt` not redeclared
- Soft delete uses `deletedAt?: Date` pattern consistently

### 5. WebSocket (if applicable)

- Event names use `WsEvent` enum constants — no raw strings
- `WsAuthGuard.authenticate(socket)` called inside `handleConnection`
- Errors emitted via `WsExceptionFilter` — no silent swallowing
- Room names follow `{businessId}:{clientId}` convention

### 6. Testing

- Bug fixes include a test that would have caught the bug
- New features include unit tests and/or E2E tests
- Tests follow AAA pattern with descriptive names
- External services (AI, Cloudinary, Agenda, email) are mocked
- No shared mutable state between tests

### 7. Type Safety

- No new `any` types introduced without justification
- `npm run build` passes — TypeScript strict mode
- No `as` type assertions used to silence errors — fix the underlying type

### 8. Code Quality

- No `console.log()` statements
- No dead code, commented-out code, or TODO comments without an issue reference
- `ResponseTransformInterceptor` wraps all responses automatically — handlers return `{ message, data, meta }` shapes only
- Error handling is correct — 404 for not found, 400 for bad input, 403 for tenant/permission violations
- No security issues (injection, auth bypass, cross-tenant leaks)

### 9. Commit Hygiene

- Commits follow conventional commit format
- Commit messages are descriptive and accurate
- Logical, atomic commits — not one massive commit or dozens of tiny fixups
