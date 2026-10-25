# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev        # watch mode
npm run build            # compile to dist/

# Linting & Formatting
npm run lint             # ESLint with auto-fix
npm run lint:check       # ESLint without fix
npm run format           # Prettier write

# Testing
npm test                 # unit tests (Jest)
npm run test:watch       # unit tests in watch mode
npm run test:e2e         # end-to-end tests
npm run test:all         # unit + e2e
npm run test:cov         # coverage report

# Run a single test file
npx jest src/path/to/file.spec.ts
```

**Pre-commit hook** runs `npm run lint`, restages, then `npm run test:all` — both must pass before a commit lands.

## Testing

All tests follow the **AAA pattern**:

```typescript
it('should do something', async () => {
  // Arrange — set up inputs, mocks, and expected values
  const input = { ... };
  mockService.method.mockResolvedValue(expected);

  // Act — invoke the unit under test
  const result = await service.method(input);

  // Assert — verify outcome
  expect(result).toEqual(expected);
});
```

- Each `it` block must have all three sections separated by a blank line and labeled with `// Arrange`, `// Act`, `// Assert`.
- One behaviour per test — do not assert multiple unrelated things in a single `it`.
- Mock at the boundary (repository/external service); never mock the module under test itself.

## Architecture

ServixOS is a multi-tenant SaaS field service management API (NestJS + TypeScript + MongoDB/Typegoose + Redis + Socket.io).

### Three portals, one codebase

| Portal                     | Route prefix    | JWT audience | Guard                          |
| -------------------------- | --------------- | ------------ | ------------------------------ |
| Business (owner/employees) | `/api/…`        | `business`   | `JwtAuthGuard` + `TenantGuard` |
| Client                     | `/client/api/…` | `client`     | `JwtClientAuthGuard`           |
| Admin                      | `/admin/api/…`  | `admin`      | `JwtAdminAuthGuard`            |

The same module can serve multiple portals — e.g. `invoices/` has both `invoices.controller.ts` (`/api/invoices`) and `client-invoices.controller.ts` (`/client/api/invoices`).

### Request lifecycle (business portal)

```
HTTP → HmacGuard → JwtAuthGuard → TenantGuard → SubscriptionGuard → PermissionsGuard → Controller → Service → Repository → MongoDB
                                                                                                         ↕ Redis cache
Response ← ResponseTransformInterceptor ← EncryptionInterceptor (opt-in via @Encrypt())
```

`ActivityLogInterceptor` runs after `ResponseTransformInterceptor` and fires a fire-and-forget Agenda job on every mutating request (POST/PATCH/PUT/DELETE).

### Repository pattern rules

- **Controllers** call services only — never repositories directly.
- **Services** own all business logic, cache reads/writes, and activity logging orchestration.
- **Repositories** hold all Mongoose/Typegoose queries — no business logic.
- All repository queries are scoped by `businessId` derived from the validated `X-Business-Id` header (never from user-supplied query params).

### Standard response shape

Every endpoint returns `ApiResponse<T>` (wrapped automatically by `ResponseTransformInterceptor`). Services return `ServiceResponse<T>` (`{ message, data?, meta?, statistics? }`); the interceptor adds `success` and `statusCode`.

```typescript
// Service returns:
return { message: CLIENTS_MESSAGES.SUCCESS.RETRIEVED, data: clients, meta };

// Wire response:
{ success: true, statusCode: 200, message: "...", data: [...], meta: { page, limit, total, totalPages } }
```

### Multi-tenancy

Every protected business-portal request must include the `X-Business-Id` header. `TenantGuard` validates it is a valid ObjectId, the business exists and is active, and it matches the `businessId` claim in the JWT — preventing all cross-tenant access.

### Subscription gating

`@RequirePlan('feature.key')` on a controller method activates `SubscriptionGuard`, which checks `business.subscription.features[]` against `FEATURE_PLAN_MAP` in `src/common/constants/subscription-features.constants.ts`. Plans: `starter < growth < pro`.

### Payload encryption (opt-in)

Apply `@Encrypt()` to a controller method to activate AES-256-GCM for that route's request body and response `data`. Only use on sensitive routes (auth credentials, payments, PII). Most routes are plain JSON.

### Caching pattern

Redis is managed via `RedisService` (ioredis, not `@nestjs/cache-manager`). All TTL values live in `src/common/constants/cache-ttl.constants.ts`. Use cache-busting version counters (e.g. `CLIENTS_LIST_VERSION`) for list caches rather than individual key invalidation.

### Background jobs

`AgendaService` wraps the `agenda` library (MongoDB-backed job queue). Job names are typed via `AgendaJobName` enum in `src/common/constants/agenda.constants.ts`. Use `agendaService.now(JOBS.XXX, data)` for fire-and-forget tasks (email sends, activity log writes).

### WebSocket

Two Socket.io namespaces: `/chat` (business team messaging) and `/client-messages` (client portal). The adapter is `RedisIoAdapter` for horizontal scaling. WebSocket auth uses `WsAuthGuard` / `WsJwtClientAuthGuard`.

## Key conventions

**Error messages** — always reference constants, never inline strings:

```typescript
return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);
```

Message files live in `src/common/constants/messages/`.

**Typegoose schemas** — always pass `PropType.ARRAY` as second arg to `@prop()` for array fields:

```typescript
@prop({ type: () => String, default: [] }, PropType.ARRAY)
services: string[];
```

**Sub-documents** — define typed classes with `@prop()` fields; never use `Schema.Types.Mixed`.

**Type-only imports** — use `import type { JwtUser }` when only used as a TypeScript type annotation.

**Phone validation** — use `@IsPhoneNumber(undefined, { message: '...' })` (not `null`).

**JSDoc** — add a short `/** ... */` JSDoc comment on all public service methods.

**Comments** — use sparingly; only comment code whose intent is non-obvious. Exception: whenever an algorithm or data structure is used, add a brief comment naming the type and explaining why it was chosen (e.g. `// Hash map for O(1) lookups by employeeId`).

**Performance** — always write time- and space-efficient code. Prefer O(n) over O(n²), avoid redundant iterations, use appropriate data structures (Map/Set for O(1) lookup, sorted structures for binary search, etc.). Annotate algorithmic choices with Big-O complexity where it aids understanding.

**Pagination** — use `buildMeta()` from `src/common/utils/pagination.util.ts` for `PaginationMeta`; accept `PaginationDto` (page/limit) in list endpoints.

**Timezone** — use `toBusinessLocalTime(utcDate, timezone)` from `src/common/utils/timezone.util.ts` when converting stored UTC dates to business-local wall-clock times for display.

**Decorators available on controllers:**

- `@CurrentUser()` → `JwtUser` (business portal)
- `@CurrentClient()` → client portal equivalent
- `@Public()` → bypasses all auth guards
- `@Permissions('resource.action')` → RBAC check
- `@RequirePlan('feature.key')` → subscription gate
- `@Encrypt()` → AES-256-GCM on request/response

## Environment variables

Required at startup (server exits if any are missing — see `main.ts`):
`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ENCRYPTION_SECRET`, `API_KEY`, `ALLOWED_ORIGINS`, `APP_URL`, `CLIENT_URL`, `CLOUDINARY_*`, `MAILJET_*`, `MAIL_FROM_*`, `ANTHROPIC_API_KEY`, `AI_WEBSITE_MODEL`, `AI_PRICING_MODEL`, `DEFAULT_CURRENCY`, `UPLOAD_SIZE_LIMIT`, `MAILTRAP_TOKEN`, `MAIL_PROVIDER`

Optional: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS`, `NODE_ENV`, `PORT`
