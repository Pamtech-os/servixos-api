# Servix OS — Backend API Documentation - Online Office

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack & Architecture](#tech-stack--architecture)
3. [Project Structure](#project-structure)
4. [Standard Response Format](#standard-response-format)
5. [Request & Response Encryption](#request--response-encryption)
6. [Subscription Plans & Feature Matrix](#subscription-plans--feature-matrix)
7. [WebSocket Communication](#websocket-communication)
8. [Central Configuration](#central-configuration)
   - [Redis Cache TTL](#redis-cache-ttl)
   - [Success & Error Messages](#success--error-messages)
9. [Database Models](#database-models)
10. [API Endpoints](#api-endpoints)
    - [Auth](#auth-module)
    - [Clients](#clients-module)
    - [Jobs](#jobs-module)
    - [Invoices](#invoices-module)
    - [Payments](#payments-module)
    - [Employees](#employees-module)
    - [Time Tracking](#time-tracking-module)
    - [Schedules](#schedules-module)
    - [Tasks](#tasks-module)
    - [Service Requests](#service-requests-module)
    - [Messaging](#messaging-module)
    - [Roles & Permissions](#roles--permissions-module)
    - [Activity Logs](#activity-logs-module)
    - [Website Builder](#website-builder-module)
    - [Analytics](#analytics-module)
    - [AI](#ai-module)
    - [Files & Contracts](#files--contracts-module)
    - [Settings](#settings-module)
11. [Guard & Middleware Strategy](#guard--middleware-strategy)
12. [Integration Test Suites](#integration-test-suites)
13. [Known Limitations](#known-limitations)

---

## Overview

**Servix OS** is a SaaS field service management platform for small to medium-sized service businesses (cleaning, plumbing, electrical, HVAC, landscaping, painting, carpentry, general contracting).

The backend serves:

- Business owner authentication & onboarding
- Full CRUD for clients, jobs, invoices, payments, contracts, and files
- Team management: employees, scheduling, time tracking, tasks, team chat
- AI-powered insights and an AI business advisor
- Real-time bidirectional messaging between business and clients via WebSocket (Socket.io)
- Service request intake (from the owner's public-facing website)
- A configurable website builder with booking forms
- Analytics (traffic + revenue)
- Role-based access control (RBAC) with 24 granular permissions
- Full audit log of all system activities

---

## Tech Stack & Architecture

| Concern              | Technology                                  |
| -------------------- | ------------------------------------------- |
| Runtime              | Node.js (LTS)                               |
| Framework            | NestJS                                      |
| Language             | TypeScript (strict)                         |
| Database             | MongoDB (Atlas / self-hosted replica set)   |
| ODM                  | Typegoose (Mongoose under the hood)         |
| Caching              | Redis (ioredis via `@nestjs/cache-manager`) |
| Auth                 | JWT (access + refresh tokens) + bcrypt      |
| Transport Encryption | AES-256-GCM (Node.js `crypto` built-in)     |
| Real-time Messaging  | Socket.io (`@nestjs/platform-socket.io`)    |
| File Storage         | Cloudinary                                  |
| PDF Generation       | Puppeteer / `@sparticuz/chromium`           |
| AI                   | Anthropic Claude API (claude-sonnet-4-6)    |
| Validation           | `class-validator` + `class-transformer`     |
| Testing              | Jest + Supertest + `@nestjs/testing`        |
| Containerisation     | Docker + Docker Compose                     |

### Architectural Pattern: Repository Pattern

```
HTTP Request
    │
    ▼
┌──────────────────────┐
│  DecryptionMiddleware │  ← decrypts AES-256-GCM request body (opt-in via @Encrypt())
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   JwtAuthGuard       │  ← validates Bearer token, attaches req.user
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   TenantGuard        │  ← validates X-Business-Id header, cross-checks with JWT
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  SubscriptionGuard   │  ← checks business plan against required feature tier
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  PermissionsGuard    │  ← checks RBAC permissions
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│     Controller       │  ← validates DTO, calls service, returns ResponseDto
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│      Service         │  ← business logic, orchestration, cache, activity logging
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│     Repository       │  ← all Typegoose/Mongoose queries (no business logic here)
└──────────┬───────────┘
           │
           ▼
        MongoDB
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌─────────────────────┐
│  Redis │  │  EncryptionInterceptor │ ← encrypts response data before sending
└────────┘  └─────────────────────┘
```

**Rules:**

- Controllers never interact with repositories directly.
- Services never build Mongoose queries; they delegate to repositories.
- Repositories never contain business logic or call other repositories except through services.
- All responses use the shared `ResponseDto<T>` wrapper.
- Cache reads/writes live in the service layer.
- Payload encryption is **opt-in per route** via `@Encrypt()` — only decorated routes decrypt the request body and encrypt the response `data`.
- Routes without `@Encrypt()` send and receive plain JSON; the middleware and interceptor are no-ops for them.
- Every protected request **must** include `X-Business-Id` header. The `TenantGuard` validates it exists, is a valid ObjectId, refers to an active business, and matches the `businessId` in the JWT — preventing any cross-tenant access.
- All repository queries are always scoped by `businessId` derived from the validated `X-Business-Id`, never from user-supplied query parameters.

---

## Project Structure

```
src/
│
├── common/                              # Shared by business, client portal, AND admin portal
│   ├── constants/
│   │   ├── cache-ttl.constants.ts         # TTL values for all three portals
│   │   ├── subscription-features.constants.ts
│   │   └── messages/
│   │       ├── auth.messages.ts
│   │       ├── client-auth.messages.ts
│   │       ├── admin-auth.messages.ts
│   │       ├── clients.messages.ts
│   │       ├── jobs.messages.ts
│   │       ├── invoices.messages.ts
│   │       ├── client-invoices.messages.ts
│   │       ├── payments.messages.ts
│   │       ├── employees.messages.ts
│   │       ├── time-tracking.messages.ts
│   │       ├── schedules.messages.ts
│   │       ├── tasks.messages.ts
│   │       ├── requests.messages.ts
│   │       ├── messaging.messages.ts
│   │       ├── client-messaging.messages.ts
│   │       ├── roles.messages.ts
│   │       ├── admin-roles.messages.ts
│   │       ├── activity-logs.messages.ts
│   │       ├── admin-activity-logs.messages.ts
│   │       ├── website.messages.ts
│   │       ├── analytics.messages.ts
│   │       ├── admin-analytics.messages.ts
│   │       ├── ai.messages.ts
│   │       ├── admin-ai.messages.ts
│   │       ├── files.messages.ts
│   │       ├── client-files.messages.ts
│   │       ├── contracts.messages.ts
│   │       ├── client-contracts.messages.ts
│   │       ├── admin-businesses.messages.ts
│   │       ├── admin-users.messages.ts
│   │       ├── admin-subscriptions.messages.ts
│   │       ├── admin-support.messages.ts
│   │       ├── settings.messages.ts
│   │       ├── subscription.messages.ts
│   │       ├── tenant.messages.ts
│   │       └── websocket.messages.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts      # @CurrentUser() — business side
│   │   ├── current-client.decorator.ts    # @CurrentClient() — client portal
│   │   ├── current-admin.decorator.ts     # @CurrentAdmin() — admin portal
│   │   ├── permissions.decorator.ts       # shared @Permissions() decorator
│   │   ├── public.decorator.ts
│   │   ├── require-plan.decorator.ts
│   │   └── encrypt.decorator.ts
│   ├── dto/
│   │   ├── response.dto.ts                # ApiResponse wrapper (shared by all three portals)
│   │   └── pagination.dto.ts
│   ├── filters/
│   │   └── all-exceptions.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts              # Business JWT (audience="business")
│   │   ├── jwt-client-auth.guard.ts       # Client JWT (audience="client")
│   │   ├── jwt-admin-auth.guard.ts        # Admin JWT (audience="admin", ADMIN_JWT_SECRET)
│   │   ├── client-ownership.guard.ts      # Enforces clientId === req.client.id
│   │   ├── admin-permissions.guard.ts     # Enforces admin permission keys (e.g. users.view)
│   │   ├── tenant.guard.ts
│   │   ├── ws-auth.guard.ts
│   │   ├── ws-jwt-client-auth.guard.ts
│   │   ├── permissions.guard.ts           # Business RBAC guard
│   │   └── subscription.guard.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts                # Passport strategy, audience="business"
│   │   ├── jwt-client.strategy.ts         # Passport strategy, audience="client"
│   │   └── jwt-admin.strategy.ts          # Passport strategy, audience="admin"
│   ├── interceptors/
│   │   ├── response-transform.interceptor.ts
│   │   ├── encryption.interceptor.ts
│   │   └── activity-log.interceptor.ts
│   ├── middleware/
│   │   └── decryption.middleware.ts
│   ├── gateways/
│   │   └── ws-exception.filter.ts
│   └── utils/
│       ├── pagination.util.ts
│       ├── hash.util.ts
│       └── crypto.util.ts
│
├── modules/                             # Feature modules — all three portals live side by side
│   │
│   ├── auth/                            # Business owner auth (/api/auth)
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts
│   │   ├── dto/
│   │   └── schemas/
│   │       └── refresh-token.schema.ts
│   │
│   ├── client-auth/                     # Client portal auth (/client/api/auth)
│   │   ├── client-auth.module.ts
│   │   ├── client-auth.controller.ts
│   │   ├── client-auth.service.ts
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   ├── forgot-password.dto.ts
│   │   │   ├── verify-otp.dto.ts
│   │   │   └── reset-password.dto.ts
│   │   └── schemas/
│   │       ├── client.schema.ts
│   │       ├── service-provider.schema.ts
│   │       ├── otp-verification.schema.ts
│   │       └── client-refresh-token.schema.ts
│   │
│   ├── admin-auth/                      # Admin portal auth (/admin/api/auth)
│   │   ├── admin-auth.module.ts
│   │   ├── admin-auth.controller.ts
│   │   ├── admin-auth.service.ts
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   ├── forgot-password.dto.ts
│   │   │   ├── verify-otp.dto.ts
│   │   │   └── reset-password.dto.ts
│   │   └── schemas/
│   │       └── admin-user.schema.ts     # AdminUser document (owned by this module)
│   │
│   ├── users/                           # Business team/user management (/api/users)
│   │   ├── users.module.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   └── schemas/
│   │       └── user.schema.ts
│   │
│   ├── admin-users/                     # Admin portal: manage admin users (/admin/api/users)
│   │   ├── admin-users.module.ts
│   │   ├── admin-users.controller.ts
│   │   ├── admin-users.service.ts
│   │   └── dto/
│   │       ├── create-admin-user.dto.ts
│   │       ├── update-admin-user.dto.ts
│   │       ├── update-user-status.dto.ts
│   │       └── bulk-email.dto.ts
│   │
│   ├── business/                        # Business owner's own data (/api/business)
│   │   ├── business.module.ts
│   │   ├── business.service.ts
│   │   ├── business.repository.ts
│   │   └── schemas/
│   │       └── business.schema.ts       # Shared schema — also read/written by admin portal
│   │
│   ├── admin-businesses/                # Admin portal: manage all businesses (/admin/api/businesses)
│   │   ├── admin-businesses.module.ts
│   │   ├── admin-businesses.controller.ts
│   │   ├── admin-businesses.service.ts
│   │   └── dto/
│   │       ├── update-business.dto.ts
│   │       ├── update-business-status.dto.ts
│   │       └── bulk-email.dto.ts
│   │
│   ├── clients/                         # Business-side client management (/api/clients)
│   ├── jobs/
│   │
│   ├── invoices/                        # Business + client portal invoice routes
│   │   ├── invoices.module.ts
│   │   ├── invoices.controller.ts       # /api/invoices (business)
│   │   ├── invoices.service.ts
│   │   ├── invoices.repository.ts
│   │   ├── client-invoices.controller.ts  # /client/api/invoices (client portal, read-only)
│   │   ├── client-invoices.service.ts
│   │   ├── dto/
│   │   │   └── list-invoices.dto.ts
│   │   └── schemas/
│   │       └── invoice.schema.ts
│   │
│   ├── payments/
│   ├── employees/
│   ├── time-tracking/
│   ├── schedules/
│   ├── tasks/
│   ├── requests/
│   │
│   ├── messaging/                       # Business staff chat + client portal messages
│   │   ├── messaging.module.ts
│   │   ├── messaging.controller.ts      # /api/messaging (business staff chat)
│   │   ├── messaging.service.ts
│   │   ├── messaging.repository.ts
│   │   ├── messaging.gateway.ts         # Socket.io — /chat namespace
│   │   ├── client-messages.controller.ts  # /client/api/messages (HTTP, read-only)
│   │   ├── client-messages.service.ts
│   │   ├── client-messages.gateway.ts   # Socket.io — /client-messages namespace
│   │   ├── dto/
│   │   │   └── ws-send-message.dto.ts
│   │   └── schemas/
│   │       ├── message.schema.ts
│   │       ├── conversation.schema.ts
│   │       ├── team-message.schema.ts
│   │       └── announcement.schema.ts
│   │
│   ├── roles/                           # Business RBAC (/api/roles)
│   │
│   ├── admin-roles/                     # Admin portal RBAC (/admin/api/roles, /admin/api/permissions)
│   │   ├── admin-roles.module.ts
│   │   ├── admin-roles.controller.ts
│   │   ├── admin-permissions.controller.ts
│   │   ├── admin-roles.service.ts
│   │   ├── dto/
│   │   │   └── create-role.dto.ts
│   │   └── schemas/
│   │       ├── admin-role.schema.ts
│   │       └── admin-permission.schema.ts
│   │
│   ├── activity-logs/                   # Business audit log + client activity feed
│   │   ├── activity-logs.module.ts
│   │   ├── activity-logs.controller.ts  # /api/activity-logs (business)
│   │   ├── activity-logs.service.ts
│   │   ├── client-activities.controller.ts  # /client/api/activities (client portal)
│   │   ├── client-activities.service.ts
│   │   └── schemas/
│   │       └── activity.schema.ts
│   │
│   ├── admin-activity-logs/             # Admin portal audit log (/admin/api/activity-logs)
│   │   ├── admin-activity-logs.module.ts
│   │   ├── admin-activity-logs.controller.ts
│   │   ├── admin-activity-logs.service.ts
│   │   └── schemas/
│   │       └── admin-activity-log.schema.ts
│   │
│   ├── website/
│   │
│   ├── analytics/                       # Business analytics (/api/analytics)
│   │
│   ├── admin-analytics/                 # Admin portal analytics (/admin/api/analytics)
│   │   ├── admin-analytics.module.ts
│   │   ├── admin-analytics.controller.ts
│   │   ├── admin-analytics.service.ts
│   │   └── schemas/
│   │       └── analytics-snapshot.schema.ts
│   │
│   ├── ai/                              # Business AI features (/api/ai)
│   │
│   ├── admin-ai/                        # Admin portal AI consumption (/admin/api/ai)
│   │   ├── admin-ai.module.ts
│   │   ├── admin-ai.controller.ts
│   │   ├── admin-ai.service.ts
│   │   ├── dto/
│   │   │   └── update-ai-limits.dto.ts
│   │   └── schemas/
│   │       └── ai-usage-log.schema.ts
│   │
│   ├── files/                           # Business file management + client file access
│   │   ├── files.module.ts
│   │   ├── files.controller.ts          # /api/files (business)
│   │   ├── files.service.ts
│   │   ├── client-files.controller.ts   # /client/api/files (client portal, read + download)
│   │   ├── client-files.service.ts
│   │   └── schemas/
│   │       └── file.schema.ts
│   │
│   ├── contracts/                       # Business contract management + client signing
│   │   ├── contracts.module.ts
│   │   ├── contracts.controller.ts      # /api/contracts (business)
│   │   ├── contracts.service.ts
│   │   ├── client-contracts.controller.ts  # /client/api/contracts (client portal, read + sign)
│   │   ├── client-contracts.service.ts
│   │   ├── dto/
│   │   │   └── sign-contract.dto.ts
│   │   └── schemas/
│   │       └── contract.schema.ts
│   │
│   ├── subscriptions/                   # Admin portal: plan management (/admin/api/subscriptions)
│   │   ├── subscriptions.module.ts
│   │   ├── subscriptions.controller.ts
│   │   ├── subscriptions.service.ts
│   │   ├── dto/
│   │   │   └── change-plan.dto.ts
│   │   └── schemas/
│   │       └── plan-history.schema.ts
│   │
│   ├── support/                         # Admin portal: support tickets (/admin/api/support)
│   │   ├── support.module.ts
│   │   ├── support.controller.ts
│   │   ├── support.service.ts
│   │   ├── dto/
│   │   │   ├── update-ticket-status.dto.ts
│   │   │   ├── update-ticket-assignee.dto.ts
│   │   │   └── create-ticket-reply.dto.ts
│   │   └── schemas/
│   │       └── support-ticket.schema.ts
│   │
│   ├── settings/
│   │
│   ├── client-dashboard/                # Client portal dashboard (/client/api/dashboard)
│   │   ├── client-dashboard.module.ts
│   │   ├── client-dashboard.controller.ts
│   │   └── client-dashboard.service.ts
│   │
│   ├── client-contacts/                 # Client portal contacts (/client/api/contacts)
│   │   ├── client-contacts.module.ts
│   │   ├── client-contacts.controller.ts
│   │   └── client-contacts.service.ts
│   │
│   ├── client-profile/                  # Client portal profile (/client/api/profile)
│   │   ├── client-profile.module.ts
│   │   ├── client-profile.controller.ts
│   │   ├── client-profile.service.ts
│   │   └── dto/
│   │       ├── update-profile.dto.ts
│   │       └── change-password.dto.ts
│   │
│   ├── admin-dashboard/                 # Admin portal dashboard (/admin/api/dashboard)
│   │   ├── admin-dashboard.module.ts
│   │   ├── admin-dashboard.controller.ts
│   │   └── admin-dashboard.service.ts
│   │
│   └── admin-team/                      # Admin portal team list (/admin/api/team)
│       ├── admin-team.module.ts
│       ├── admin-team.controller.ts
│       └── admin-team.service.ts
│
├── config/
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── jwt.config.ts                    # Business JWT secret + expiry
│   ├── jwt-client.config.ts             # Client JWT secret (CLIENT_JWT_SECRET) + expiry
│   ├── jwt-admin.config.ts              # Admin JWT secret (ADMIN_JWT_SECRET) + expiry
│   ├── cloudinary.config.ts
│   ├── encryption.config.ts
│   ├── websocket.config.ts
│   └── ai.config.ts
│
├── app.module.ts
└── main.ts
```

---

## Standard Response Format

Every endpoint returns the following shape. The `ResponseTransformInterceptor` wraps controller return values automatically.

```typescript
// src/common/dto/response.dto.ts

export class PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}
```

**Success example:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Clients retrieved successfully",
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

**Error example:**

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Client not found"
}
```

The global `AllExceptionsFilter` converts all thrown `HttpException` (and unexpected errors) to this shape.

---

## Request & Response Encryption

Payload encryption is **opt-in per route**. By default all endpoints send and receive plain JSON over TLS. Applying the `@Encrypt()` decorator to a controller method activates AES-256-GCM encryption for that route's request body and response data. This lets you selectively protect sensitive operations (e.g. login, payment creation, AI advisor) without forcing encryption overhead on every endpoint.

### When to Use `@Encrypt()`

Apply `@Encrypt()` to routes that handle:

- Authentication credentials (`POST /auth/login`, `POST /auth/register`, `POST /auth/verify-pin`, `POST /auth/complete-setup`, `POST /auth/reset-password`)
- Financial data (`POST /payments`, `PATCH /payments/:id`, `POST /invoices`, `GET /invoices/:id`)
- Personally identifiable information (`POST /clients`, `PATCH /clients/:id`, `POST /employees`)
- AI conversations (`POST /ai/advisor`, `POST /ai/insights`)
- Any route you explicitly want double-layer protection on beyond TLS

Routes without `@Encrypt()` behave as normal JSON REST endpoints — no performance overhead, no change in client integration.

### Algorithm

**AES-256-GCM** — authenticated encryption. Chosen because:

- 256-bit key: quantum-resistant for the foreseeable future.
- GCM mode: provides both confidentiality (encryption) and integrity/authenticity (authentication tag) in a single pass.
- Built into Node.js `crypto` — zero additional dependencies.

### `@Encrypt()` Decorator

```typescript
// src/common/decorators/encrypt.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ENCRYPT_KEY = 'useEncryption';

/**
 * Apply to a controller method to enable AES-256-GCM encryption
 * for both the incoming request body and the outgoing response data.
 *
 * @example
 * @Post('login')
 * @Encrypt()
 * async login(@Body() dto: LoginDto) { ... }
 */
export const Encrypt = () => SetMetadata(ENCRYPT_KEY, true);
```

### Envelope Format

Every encrypted payload (request body or response `data`) is a JSON object:

```json
{
  "iv": "base64-encoded 12-byte random IV",
  "tag": "base64-encoded 16-byte GCM auth tag",
  "payload": "base64-encoded AES-256-GCM ciphertext"
}
```

- A **fresh IV is generated for every encryption call** — never reused.
- The auth tag is verified during decryption; tampered payloads are rejected with `400 Bad Request`.

### Shared Secret Key

```
ENCRYPTION_SECRET=<64 hex chars = 32 bytes = 256 bits>
```

Stored in environment variables / AWS Secrets Manager. Rotated on a schedule. The key is **never** transmitted over the wire.

### Configuration

```typescript
// src/config/encryption.config.ts
import { registerAs } from '@nestjs/config';

export const encryptionConfig = registerAs('encryption', () => ({
  secret: process.env.ENCRYPTION_SECRET, // 64-char hex string → 32-byte key
  algorithm: 'aes-256-gcm',
  ivLength: 12, // bytes — NIST recommendation for GCM
  tagLength: 16, // bytes
}));
```

### Crypto Utility

```typescript
// src/common/utils/crypto.util.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;

export function encrypt(
  plaintext: string,
  secretHex: string,
): EncryptedEnvelope {
  const key = Buffer.from(secretHex, 'hex');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: 16 });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    payload: encrypted.toString('base64'),
  };
}

export function decrypt(
  envelope: EncryptedEnvelope,
  secretHex: string,
): string {
  const key = Buffer.from(secretHex, 'hex');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const encrypted = Buffer.from(envelope.payload, 'base64');

  const decipher = createDecipheriv(ALG, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

export interface EncryptedEnvelope {
  iv: string;
  tag: string;
  payload: string;
}
```

### Decryption Middleware

Runs before every guard on all routes. It checks for the `ENCRYPT_KEY` metadata on the matched handler. If the route is **not** decorated with `@Encrypt()`, the middleware is a no-op and the request body passes through untouched.

```typescript
// src/common/middleware/decryption.middleware.ts
@Injectable()
export class DecryptionMiddleware implements NestMiddleware {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Only decrypt when the matched route is decorated with @Encrypt()
    const shouldDecrypt = this.reflector.get<boolean>(
      ENCRYPT_KEY,
      req.route?.handler,
    );

    if (!shouldDecrypt || !req.body?.payload) {
      return next();
    }

    try {
      const secret = this.config.get<string>('encryption.secret');
      const plaintext = decrypt(req.body as EncryptedEnvelope, secret);
      req.body = JSON.parse(plaintext);
    } catch {
      throw new BadRequestException('Invalid or tampered request payload');
    }

    next();
  }
}
```

### Encryption Interceptor

Runs after `ResponseTransformInterceptor`. Checks for `ENCRYPT_KEY` metadata on the handler. If the route is **not** decorated with `@Encrypt()`, the interceptor is a no-op and the response passes through unmodified.

```typescript
// src/common/interceptors/encryption.interceptor.ts
@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const shouldEncrypt = this.reflector.getAllAndOverride<boolean>(
      ENCRYPT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Pass through untouched for non-@Encrypt() routes
    if (!shouldEncrypt) return next.handle();

    const secret = this.config.get<string>('encryption.secret');

    return next.handle().pipe(
      map((response: ApiResponse<unknown>) => {
        if (response?.data === undefined) return response;

        return {
          ...response,
          data: encrypt(JSON.stringify(response.data), secret),
        };
      }),
    );
  }
}
```

### Usage on a Controller

```typescript
// Example: encrypting only the sensitive routes in AuthController
@Controller('auth')
export class AuthController {

  @Post('register')
  @Encrypt()                      // ← request body decrypted, response data encrypted
  register(@Body() dto: RegisterDto) { ... }

  @Post('login')
  @Encrypt()                      // ← encrypted
  login(@Body() dto: LoginDto) { ... }

  @Post('logout')
                                  // ← no @Encrypt() — plain JSON, no overhead
  logout() { ... }

  @Post('forgot-password')
                                  // ← no @Encrypt() — email only, low sensitivity
  forgotPassword(@Body() dto: ForgotPasswordDto) { ... }
}
```

The decorator can also be applied at **class level** to encrypt every route in a controller:

```typescript
@Controller('ai')
@Encrypt()                        // ← all routes in this controller are encrypted
export class AiController { ... }
```

### Wire Examples

**Non-encrypted route** (`POST /auth/logout`) — standard plain JSON:

```json
// Request body
{ }

// Response
{
  "success":    true,
  "statusCode": 200,
  "message":    "Logged out successfully"
}
```

**Encrypted route** (`POST /auth/login`) — `@Encrypt()` applied:

```json
// Request body (client sends an EncryptedEnvelope)
{
  "iv":      "base64randomIV==",
  "tag":     "base64authTag==",
  "payload": "base64ciphertext=="
}

// Response (server returns encrypted data field)
{
  "success":    true,
  "statusCode": 200,
  "message":    "Login successful",
  "data": {
    "iv":      "A1B2C3D4E5F6G7H8",
    "tag":     "XyZ1234AAABBBCCC",
    "payload": "u7Hk9...base64ciphertext...=="
  }
}
```

**Note:** `meta` (pagination), `success`, `statusCode`, and `message` are never encrypted — they are structural metadata the client needs before decrypting `data`.

---

---

## Subscription Plans & Feature Matrix

Servix OS offers three subscription tiers. Every new business starts with a **1-month free trial** — no payment required. After the trial ends, the business must subscribe to a paid plan to continue. The `SubscriptionGuard` enforces plan gates at the route level via the `@RequirePlan()` decorator.

### Plans

#### Free Trial (1 month)

All new businesses start here automatically on registration. Full access equivalent to the plan they signed up for. No payment method required. Transitions to `locked` if no plan is purchased when the trial expires.

#### Starter ($29 / month)

Entry-level plan for sole traders just getting started. Core operations only.

#### Growth ($79 / month)

Growing businesses with a small team. Unlocks team management, advanced scheduling, and analytics.

#### Pro ($100 / month)

Full feature access for established businesses with complex operations, multiple employees, and AI-driven strategy.

---

### Feature Matrix

| Feature                           | Starter |    Growth    |      Pro      |
| --------------------------------- | :-----: | :----------: | :-----------: |
| **Clients**                       |         |              |               |
| Manage clients (CRUD)             |    ✓    |      ✓       |       ✓       |
| Client data export                |    —    |      ✓       |       ✓       |
| Client messaging                  |    —    |      ✓       |       ✓       |
| **Jobs**                          |         |              |               |
| Manage jobs (CRUD)                |    ✓    |      ✓       |       ✓       |
| Contract generation & sending     |    —    |      ✓       |       ✓       |
| **Invoices & Payments**           |         |              |               |
| Manage invoices (CRUD)            |    ✓    |      ✓       |       ✓       |
| Invoice PDF generation & email    |    —    |      ✓       |       ✓       |
| Manage payments (CRUD)            |    ✓    |      ✓       |       ✓       |
| **Team Management**               |         |              |               |
| Employee management               |    —    | ✓ (up to 10) | ✓ (unlimited) |
| Time tracking (clock in/out)      |    —    |      ✓       |       ✓       |
| Scheduling / shift management     |    —    |      ✓       |       ✓       |
| Task management (kanban)          |    —    |      ✓       |       ✓       |
| Team messaging & announcements    |    —    |      ✓       |       ✓       |
| **Service Requests**              |         |              |               |
| Receive & manage service requests |    ✓    |      ✓       |       ✓       |
| **Roles & Permissions**           |         |              |               |
| Default roles only                |    ✓    |      ✓       |       ✓       |
| Custom role creation              |    —    |      —       |       ✓       |
| **Website Builder**               |         |              |               |
| Website builder & booking form    |    ✓    |      ✓       |       ✓       |
| Custom domain support             |    —    |      —       |       ✓       |
| **Analytics**                     |         |              |               |
| Dashboard stats                   |    ✓    |      ✓       |       ✓       |
| Revenue & job charts              |    —    |      ✓       |       ✓       |
| Traffic analytics                 |    —    |      ✓       |       ✓       |
| **AI Features**                   |         |              |               |
| AI business insights              |    —    |      —       |       ✓       |
| AI advisor (chat)                 |    —    |      —       |       ✓       |
| AI business description generator |    ✓    |      ✓       |       ✓       |
| **Files & Contracts**             |         |              |               |
| File uploads (per client)         |    —    |      ✓       |       ✓       |
| Contract management               |    —    |      ✓       |       ✓       |
| **Activity Logs**                 |         |              |               |
| View activity logs                |    —    | ✓ (30 days)  |  ✓ (1 year)   |
| **Limits**                        |         |              |               |
| Max clients                       |   25    |     250      |   Unlimited   |
| Max jobs / month                  |   20    |     200      |   Unlimited   |
| Max invoices / month              |   20    |     200      |   Unlimited   |
| Max employees                     |    0    |      10      |   Unlimited   |

---

### Plan Constants & Feature Gate Map

```typescript
// src/common/constants/subscription-features.constants.ts

import { SubscriptionPlan } from '../modules/business/schemas/business.schema';

/**
 * Maps every feature gate key to the MINIMUM plan required to access it.
 * Plans are ordered: starter < growth < pro.
 */
export const PLAN_ORDER: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.STARTER]: 0,
  [SubscriptionPlan.GROWTH]: 1,
  [SubscriptionPlan.PRO]: 2,
};

export const FEATURE_PLAN_MAP: Record<string, SubscriptionPlan> = {
  // Clients
  'clients.export': SubscriptionPlan.GROWTH,
  'clients.messaging': SubscriptionPlan.GROWTH,

  // Jobs
  'jobs.contracts': SubscriptionPlan.GROWTH,

  // Invoices
  'invoices.pdf': SubscriptionPlan.GROWTH,
  'invoices.send': SubscriptionPlan.GROWTH,

  // Team
  'employees.manage': SubscriptionPlan.GROWTH,
  'time-tracking.all': SubscriptionPlan.GROWTH,
  'schedules.all': SubscriptionPlan.GROWTH,
  'tasks.all': SubscriptionPlan.GROWTH,
  'team.messaging': SubscriptionPlan.GROWTH,

  // Analytics
  'analytics.revenue': SubscriptionPlan.GROWTH,
  'analytics.traffic': SubscriptionPlan.GROWTH,

  // Roles
  'roles.custom': SubscriptionPlan.PRO,

  // Website
  'website.custom-domain': SubscriptionPlan.PRO,

  // AI
  'ai.insights': SubscriptionPlan.PRO,
  'ai.advisor': SubscriptionPlan.PRO,

  // Files & Contracts
  'files.all': SubscriptionPlan.GROWTH,
  'contracts.all': SubscriptionPlan.GROWTH,

  // Activity Logs
  'activity-logs.view': SubscriptionPlan.GROWTH,
} as const;

export type FeatureKey = keyof typeof FEATURE_PLAN_MAP;

/**
 * Per-plan hard limits. Enforced in service layer before insert.
 */
export const PLAN_LIMITS = {
  [SubscriptionPlan.STARTER]: {
    maxClients: 25,
    maxJobsPerMonth: 20,
    maxInvoicesPerMonth: 20,
    maxEmployees: 0,
    activityLogDays: 0,
  },
  [SubscriptionPlan.GROWTH]: {
    maxClients: 250,
    maxJobsPerMonth: 200,
    maxInvoicesPerMonth: 200,
    maxEmployees: 10,
    activityLogDays: 30,
  },
  [SubscriptionPlan.PRO]: {
    maxClients: Infinity,
    maxJobsPerMonth: Infinity,
    maxInvoicesPerMonth: Infinity,
    maxEmployees: Infinity,
    activityLogDays: 365,
  },
} as const;
```

### `@RequirePlan()` Decorator

```typescript
// src/common/decorators/require-plan.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PLAN_KEY = 'requirePlan';

/**
 * @RequirePlan('ai.insights')
 * Attach a feature key. The SubscriptionGuard resolves the minimum plan
 * from FEATURE_PLAN_MAP and enforces it.
 */
export const RequirePlan = (featureKey: FeatureKey) =>
  SetMetadata(REQUIRE_PLAN_KEY, featureKey);
```

### Subscription Plan Guard

```typescript
// src/common/guards/subscription.guard.ts
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly businessRepository: BusinessRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<FeatureKey>(
      REQUIRE_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePlan() decorator — no plan restriction
    if (!featureKey) return true;

    const { businessId } = context.switchToHttp().getRequest().user;
    const business = await this.businessRepository.findById(businessId);
    if (!business) throw new NotFoundException('Business not found');

    const requiredPlan = FEATURE_PLAN_MAP[featureKey];
    const currentPlan = business.subscriptionPlan;

    const hasAccess = PLAN_ORDER[currentPlan] >= PLAN_ORDER[requiredPlan];

    if (!hasAccess) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: SUBSCRIPTION_MESSAGES.ERROR.PLAN_REQUIRED(requiredPlan),
        currentPlan,
        requiredPlan,
        upgradeUrl: '/settings?tab=subscription',
      });
    }

    return true;
  }
}
```

### Limit Enforcement (Service Layer)

Hard limits (max clients, max jobs/month, etc.) are checked inside the service before insert — not at the guard level — because they require DB count queries. Example:

```typescript
// src/modules/clients/clients.service.ts
async createClient(dto: CreateClientDto, businessId: string): Promise<Client> {
  const business = await this.businessRepository.findById(businessId);
  const limits   = PLAN_LIMITS[business.subscriptionPlan];

  if (limits.maxClients !== Infinity) {
    const count = await this.clientRepository.countActive(businessId);
    if (count >= limits.maxClients) {
      throw new ForbiddenException({
        code:        'LIMIT_REACHED',
        message:     SUBSCRIPTION_MESSAGES.ERROR.CLIENT_LIMIT_REACHED(limits.maxClients),
        currentPlan: business.subscriptionPlan,
        upgradeUrl:  '/settings?tab=subscription',
      });
    }
  }

  return this.clientRepository.create({ ...dto, businessId });
}
```

### Subscription Upgrade Flow

When a user hits a plan gate (`403 SUBSCRIPTION_REQUIRED` or `403 LIMIT_REACHED`) the frontend redirects to `/settings?tab=subscription`. The `PATCH /settings/subscription` endpoint updates `Business.subscriptionPlan`. In production this integrates with the in-app payment flow.

---

### In-App Payment Processing

Subscription billing is handled entirely within the platform via **Stripe**. No external redirect or out-of-band billing service is required.

**Flow:**

1. The client collects card details using **Stripe.js / Stripe Elements** — card data never touches the backend directly.
2. The frontend sends a `POST /billing/subscribe` request with `{ planId, paymentMethodId }`.
3. The backend creates or updates a Stripe `Customer`, attaches the payment method, and creates/updates a `Subscription` object.
4. Stripe webhook events (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`) are consumed by `POST /billing/webhook` to keep `Business.subscriptionStatus` and `Business.subscriptionPlan` in sync.

**Business schema fields:**

```typescript
subscriptionPlan:   SubscriptionPlan;   // starter | growth | pro
subscriptionStatus: SubscriptionStatus; // trialing | active | grace_period | locked | canceled
trialEndsAt?:       Date;               // set on registration, cleared after first payment
currentPeriodEnd?:  Date;               // end of current paid billing period (from Stripe)
gracePeriodEndsAt?: Date;               // currentPeriodEnd + 5 days, set on payment failure
```

---

### 1-Month Free Trial

Every new business gets a **1-month free trial** on registration. During the trial the business has full access equivalent to the plan they signed up for. No payment method is required to start the trial.

- `Business.subscriptionStatus` is set to `'trialing'` on registration.
- `Business.trialEndsAt` is set to `now + 1 month`.
- The `SubscriptionGuard` treats `trialing` as equivalent to `active` for plan-gate checks.
- When `trialEndsAt` is reached (checked via a scheduled job), `subscriptionStatus` transitions to `locked` unless the business has subscribed to a paid plan.

---

### Subscription Grace Period & Lock

When a subscription lapses (failed payment or explicit cancellation), the business enters a **5-day grace period** before being locked.

| Day        | Status         | Effect                                                            |
| ---------- | -------------- | ----------------------------------------------------------------- |
| Expiry day | `grace_period` | All features remain accessible. Banner shown on dashboard.        |
| Days 1–5   | `grace_period` | Full access continues. Daily reminder emails sent.                |
| Day 6+     | `locked`       | Business and all its employees are blocked from all app activity. |

**Lock enforcement:**

- The `SubscriptionGuard` checks `Business.subscriptionStatus`. If `locked`, every protected request returns `403 SUBSCRIPTION_LOCKED`.
- On the frontend, a **non-closable modal** is displayed whenever `subscriptionStatus === 'locked'`. The modal is rendered at the app-shell level (above all routes) and cannot be dismissed — it persists until the subscription is renewed. It shows the renewal CTA and payment form inline.
- The modal is driven by the subscription status returned from the `/auth/me` or `/business/status` endpoint on app load, so employees of a locked business also see it and cannot perform any actions.

**Status transitions:**

```
active → grace_period (on payment failure / subscription end)
grace_period → active  (on successful payment within 5 days)
grace_period → locked  (on day 6 with no payment)
locked → active        (on successful payment)
trialing → active      (on first successful payment)
trialing → locked      (on trial expiry with no payment method)
```

---

## WebSocket Communication

Real-time messaging between a business and its clients is implemented with **Socket.io** via the `@nestjs/platform-socket.io` adapter. The REST endpoints in the Messaging module handle message history, unread counts, and announcements. The WebSocket gateway handles live message delivery, typing indicators, read receipts, and online presence.

---

### Architecture Overview

```
Business Dashboard (browser)          Client Portal (browser / mobile)
        │                                         │
        │  wss://api.servixos.com/chat            │  wss://api.servixos.com/chat
        │  handshake: { token, businessId }│  handshake: { token, businessId }
        └──────────────────┬──────────────────────┘
                           │
                    ┌──────▼───────┐
                    │  WsAuthGuard │  ← validates token on connect
                    └──────┬───────┘
                           │
                    ┌──────▼──────────────┐
                    │  MessagingGateway   │  ← /chat namespace
                    │  (Socket.io server) │
                    └──────┬─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        MessagingService  Redis      MongoDB
        (persist + fan-out) (presence) (Message, Conversation)
```

**Room naming convention:** Each business–client thread has its own Socket.io room:

```
room: `{businessId}:{clientId}`
```

Both the business-side socket and the client-side socket join the same room. Messages emitted to the room are received by all participants in real time.

---

### Namespaces

| Namespace   | Purpose                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `/chat`     | Business ↔ client real-time messaging (send, deliver, read receipts)   |
| `/presence` | Team/employee online presence — powers the "X Online" dashboard widget |

The two namespaces share the same `WsAuthGuard` authentication logic but serve different purposes. A business-side user (owner or employee) connects to **both** namespaces when they open the dashboard. The `/chat` namespace is only joined when a user opens a client conversation. The `/presence` namespace is joined immediately on dashboard load.

---

### WebSocket Configuration

```typescript
// src/config/websocket.config.ts
import { registerAs } from '@nestjs/config';

export const websocketConfig = registerAs('websocket', () => ({
  namespace: '/chat',
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
    ],
    credentials: true,
  },
  pingTimeout: 20000, // ms — disconnect if no pong within 20s
  pingInterval: 10000, // ms — send ping every 10s
  transports: ['websocket', 'polling'], // polling as fallback
  maxHttpBufferSize: 1e6, // 1 MB max message size
}));
```

---

### Authentication on Connection

Authentication is enforced in the Socket.io `handleConnection` lifecycle hook before any events are processed. The client passes credentials in the **handshake `auth` object** — not in headers (Socket.io does not reliably support custom headers in all transports).

**Client-side connection:**

```typescript
const socket = io('wss://api.servixos.com/chat', {
  auth: {
    token: '<JWT accessToken>',
    businessId: '<MongoDB ObjectId>',
  },
  transports: ['websocket', 'polling'],
});
```

**`WsAuthGuard` validation sequence on `handleConnection`:**

1. Extract `socket.handshake.auth.token` → verify JWT signature and expiry. Invalid → `disconnect('INVALID_TOKEN')`.
2. Extract `socket.handshake.auth.businessId` → validate ObjectId format, cross-check against JWT `businessId` claim. Mismatch → `disconnect('TENANT_MISMATCH')`.
3. Fetch `Business` document (Redis cache first). Not found / inactive → `disconnect('BUSINESS_NOT_FOUND')`.
4. Attach `{ userId, businessId, userRole, clientId? }` to `socket.data` for all subsequent event handlers.
5. Emit `connected` event to the client with a confirmation payload.

Disconnection reasons are emitted as a `connection_error` event before the socket is closed so the client can surface a meaningful message.

---

### Gateway Implementation

```typescript
// src/modules/messaging/messaging.gateway.ts

@WebSocketGateway({ namespace: '/chat', cors: websocketConfig().cors })
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly messagingService: MessagingService,
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly redis: Redis,
  ) {}

  async handleConnection(socket: Socket) {
    await this.wsAuthGuard.authenticate(socket); // throws → auto-disconnect
    const { businessId, userId } = socket.data;

    // Track online presence in Redis
    await this.redis.sadd(`presence:${businessId}`, userId);
    await this.redis.expire(`presence:${businessId}`, CACHE_TTL.WS_PRESENCE);

    // Notify business-side participants that this user is online
    this.server
      .to(`presence:${businessId}`)
      .emit(WsEvent.USER_ONLINE, { userId });
  }

  async handleDisconnect(socket: Socket) {
    const { businessId, userId } = socket.data ?? {};
    if (!businessId || !userId) return;

    await this.redis.srem(`presence:${businessId}`, userId);
    this.server
      .to(`presence:${businessId}`)
      .emit(WsEvent.USER_OFFLINE, { userId });
  }
}
```

---

### Events Reference

#### Client → Server (emitted by browser/mobile)

| Event          | Payload                                       | Description                                     |
| -------------- | --------------------------------------------- | ----------------------------------------------- |
| `join_room`    | `{ clientId: string }`                        | Join the `{businessId}:{clientId}` room         |
| `leave_room`   | `{ clientId: string }`                        | Leave the room                                  |
| `send_message` | `{ clientId: string, content: string }`       | Send a message; persisted to DB then broadcast  |
| `typing_start` | `{ clientId: string }`                        | User started typing                             |
| `typing_stop`  | `{ clientId: string }`                        | User stopped typing                             |
| `mark_read`    | `{ clientId: string, upToMessageId: string }` | Mark all messages up to `upToMessageId` as read |

#### Server → Client (emitted by gateway)

| Event                 | Payload                                                     | Description                                   |
| --------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `connected`           | `{ socketId: string, userId: string }`                      | Handshake confirmed                           |
| `connection_error`    | `{ code: string, message: string }`                         | Auth failure before disconnect                |
| `message_received`    | `{ message: MessagePayload }`                               | New message broadcast to everyone in the room |
| `message_delivered`   | `{ messageId: string, deliveredAt: string }`                | Delivery acknowledgement to original sender   |
| `message_read`        | `{ upToMessageId: string, readAt: string, readBy: string }` | Read receipt broadcast to the room            |
| `user_typing`         | `{ userId: string, senderName: string }`                    | Typing indicator broadcast to the room        |
| `user_stopped_typing` | `{ userId: string }`                                        | Typing stopped                                |
| `user_online`         | `{ userId: string }`                                        | A participant in the business came online     |
| `user_offline`        | `{ userId: string }`                                        | A participant went offline                    |
| `room_joined`         | `{ room: string, history: MessagePayload[] }`               | Confirmation + last 20 messages on join       |
| `error`               | `{ code: string, message: string }`                         | Event-level error (e.g. invalid payload)      |

#### Event Name Constants

```typescript
// src/modules/messaging/messaging.gateway.ts
export enum WsEvent {
  // Client → Server
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  SEND_MESSAGE = 'send_message',
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',
  MARK_READ = 'mark_read',

  // Server → Client
  CONNECTED = 'connected',
  CONNECTION_ERROR = 'connection_error',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_DELIVERED = 'message_delivered',
  MESSAGE_READ = 'message_read',
  USER_TYPING = 'user_typing',
  USER_STOPPED_TYPING = 'user_stopped_typing',
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
  ROOM_JOINED = 'room_joined',
  ERROR = 'error',
}
```

---

### `send_message` Flow

```
Client emits send_message { clientId, content }
        │
        ▼
MessagingGateway.handleSendMessage()
        │
        ├─► Validate payload (clientId is valid ObjectId, content not empty)
        │
        ├─► MessagingService.createMessage()
        │       ├─ Persist Message doc (status: SENT)
        │       └─ Upsert Conversation (lastMessage, unreadCount++)
        │
        ├─► socket.to(`{businessId}:{clientId}`).emit(MESSAGE_RECEIVED, messagePayload)
        │       └─ All sockets in the room (including sender) receive the message
        │
        └─► Acknowledge to sender: callback({ success: true, messageId })
```

The gateway **always persists to MongoDB first** before broadcasting. This guarantees message durability regardless of connection state. If the recipient is offline, they will retrieve missed messages via `GET /messages/:clientId` (REST history endpoint) when they reconnect.

---

### `mark_read` Flow

```
Client emits mark_read { clientId, upToMessageId }
        │
        ▼
MessagingGateway.handleMarkRead()
        │
        ├─► MessagingService.markMessagesRead(businessId, clientId, upToMessageId)
        │       ├─ Bulk update: Message.status = READ, readAt = now
        │       │  WHERE conversationId = X AND _id <= upToMessageId AND sender ≠ requester
        │       └─ Update Conversation.businessUnreadCount (or clientUnreadCount) = 0
        │
        └─► socket.to(room).emit(MESSAGE_READ, { upToMessageId, readAt, readBy })
```

---

### Typing Indicators

Typing events are **not persisted** — they are ephemeral and broadcast directly:

```
Client emits typing_start { clientId }
        │
        ▼
socket.to(`{businessId}:{clientId}`).emit(USER_TYPING, { userId, senderName })
```

A debounce is expected on the client side (emit `typing_start` at most once per 2 seconds; emit `typing_stop` when input clears or after 3 seconds of inactivity).

---

### Online Presence

Online status is tracked in Redis sets:

```
Key:   presence:{businessId}
Type:  Set
Value: Set of currently connected userIds
TTL:   CACHE_TTL.WS_PRESENCE (rolling — refreshed on each heartbeat)
```

When a socket connects, the userId is added to the set and a `user_online` event is broadcast to all sockets in `presence:{businessId}`. On disconnect it is removed and `user_offline` is broadcast.

---

### Fallback: Offline Message Delivery

When the recipient is not connected, the message is persisted with `status: SENT`. On the next connection, the client joins its room and receives the full unread message list via the `room_joined` event payload (`history: last 20 messages`). Older history is fetched on demand via `GET /messages/:clientId`.

---

### Error Handling

All event handler errors are caught and emitted back to the originating socket as an `error` event:

```typescript
// src/common/gateways/ws-exception.filter.ts
@Catch(WsException, HttpException)
export class WsExceptionFilter implements WsExceptionFilter {
  catch(exception: WsException | HttpException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    const error =
      exception instanceof WsException
        ? exception.getError()
        : { message: exception.message };

    client.emit(WsEvent.ERROR, {
      code: exception instanceof WsException ? 'WS_ERROR' : 'HTTP_ERROR',
      message: typeof error === 'string' ? error : (error as any).message,
    });
  }
}
```

---

### `/presence` Namespace — Team Online Presence

This namespace powers the **"X Online"** header widget and the online employee list shown in the screenshot. It is separate from `/chat` so that presence tracking is always active regardless of whether the user has opened a conversation.

#### How It Works

```
User opens dashboard
       │
       ├─► HTTP  GET /employees/online        ← initial render (instant list on page load)
       │         returns: [{ id, fullName, initials, avatarColor }]
       │
       └─► WS    connect to /presence         ← real-time updates
                 on connect: add to Redis presence set, broadcast user_online
                 on disconnect: remove from Redis, broadcast user_offline
```

The HTTP endpoint provides the **initial state** so the widget renders immediately without waiting for a WebSocket event. The WebSocket keeps it live as team members join or leave.

#### Presence Gateway

```typescript
// src/modules/employees/presence.gateway.ts

@WebSocketGateway({ namespace: '/presence', cors: websocketConfig().cors })
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly employeeRepository: EmployeeRepository,
    private readonly redis: Redis,
  ) {}

  async handleConnection(socket: Socket) {
    // Same WsAuthGuard logic as /chat — validates token, businessId
    await this.wsAuthGuard.authenticate(socket);

    const { businessId, userId } = socket.data;

    // Resolve display metadata from Employee document
    const employee = await this.employeeRepository.findByUserId(userId);
    const presence: OnlineUser = {
      userId,
      employeeId: employee?._id.toString(),
      fullName: employee?.fullName ?? 'Unknown',
      initials: this.getInitials(employee?.fullName),
      avatarColor: this.getAvatarColor(userId),
    };

    // Add to Redis presence hash: presence:{businessId} → { [userId]: OnlineUser }
    await this.redis.hset(
      `presence:${businessId}`,
      userId,
      JSON.stringify(presence),
    );
    await this.redis.expire(`presence:${businessId}`, CACHE_TTL.WS_PRESENCE);

    // Join business-wide presence room
    await socket.join(`presence:${businessId}`);

    // Broadcast to all other connected team members
    socket
      .to(`presence:${businessId}`)
      .emit(PresenceEvent.USER_ONLINE, presence);

    // Send the full current online list back to the connecting user
    const onlineList = await this.getOnlineList(businessId);
    socket.emit(PresenceEvent.ONLINE_LIST, {
      count: onlineList.length,
      users: onlineList,
    });
  }

  async handleDisconnect(socket: Socket) {
    const { businessId, userId } = socket.data ?? {};
    if (!businessId || !userId) return;

    await this.redis.hdel(`presence:${businessId}`, userId);

    this.server
      .to(`presence:${businessId}`)
      .emit(PresenceEvent.USER_OFFLINE, { userId });
  }

  private async getOnlineList(businessId: string): Promise<OnlineUser[]> {
    const hash = await this.redis.hgetall(`presence:${businessId}`);
    return Object.values(hash ?? {}).map((v) => JSON.parse(v));
  }

  private getInitials(fullName?: string): string {
    if (!fullName) return '??';
    return fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  private getAvatarColor(userId: string): string {
    // Deterministic color from userId hash so avatar color is consistent across sessions
    const colors = [
      '#6366f1',
      '#8b5cf6',
      '#ec4899',
      '#f59e0b',
      '#10b981',
      '#3b82f6',
      '#ef4444',
    ];
    const idx = parseInt(userId.slice(-2), 16) % colors.length;
    return colors[idx];
  }
}

export interface OnlineUser {
  userId: string;
  employeeId?: string;
  fullName: string;
  initials: string;
  avatarColor: string;
}
```

#### Presence Events Reference

##### Server → Client

| Event          | Payload                                  | Description                                                   |
| -------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `online_list`  | `{ count: number, users: OnlineUser[] }` | Sent to the connecting socket — full current online list      |
| `user_online`  | `OnlineUser`                             | Broadcast when a team member connects — add to widget         |
| `user_offline` | `{ userId: string }`                     | Broadcast when a team member disconnects — remove from widget |

##### Event Name Constants

```typescript
// src/modules/employees/presence.gateway.ts
export enum PresenceEvent {
  ONLINE_LIST = 'online_list',
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
}
```

#### Redis Presence Data Structure

```
Key:   presence:{businessId}
Type:  Hash
Field: userId  →  JSON-serialised OnlineUser
TTL:   CACHE_TTL.WS_PRESENCE (rolling — reset on each connection)
```

A **hash** (rather than a set) is used so the gateway can return the full `OnlineUser` display metadata (name, initials, color) from a single `HGETALL` without extra lookups.

#### Client-side Integration Pattern

```typescript
// 1. On dashboard mount — get initial list via HTTP
const { data } = await GET('/employees/online');
setOnlineUsers(data.users); // renders "8 Online" widget immediately

// 2. Connect to /presence WebSocket — receive live updates
const presenceSocket = io('/presence', { auth: { token, businessId } });

presenceSocket.on('online_list', ({ users }) => {
  setOnlineUsers(users); // syncs with server state post-connect
});

presenceSocket.on('user_online', (user) => {
  setOnlineUsers((prev) => [...prev, user]); // add avatar to widget
});

presenceSocket.on('user_offline', ({ userId }) => {
  setOnlineUsers((prev) => prev.filter((u) => u.userId !== userId)); // remove avatar
});
```

#### Presence Gateway — project file

Add to project structure under `src/modules/employees/`:

```
├── employees/
│   ├── employees.module.ts
│   ├── employees.controller.ts
│   ├── employees.service.ts
│   ├── employees.repository.ts
│   ├── presence.gateway.ts        # /presence WebSocket gateway
│   ├── dto/
│   └── schemas/
│       └── employee.schema.ts
```

---

### WebSocket Horizontal Scaling

The WebSocket layer scales horizontally via the **`@socket.io/redis-adapter`**. All Socket.io servers share a single Redis pub/sub channel, so a message emitted on node A is automatically forwarded to clients connected to nodes B or C.

**Setup:**

```typescript
// src/app.module.ts (or websocket bootstrap)
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

**Presence with multiple nodes:**

The `presence:{businessId}` Redis hash is already stored in Redis (not in-process), so all nodes read and write to the same source of truth. No additional changes are needed for presence tracking to work correctly across instances.

**Load balancing requirement:**

WebSocket connections require **sticky sessions** (session affinity) at the load balancer level so that Socket.io's upgrade handshake (HTTP → WebSocket) lands on the same node. Configure this in your load balancer (e.g., AWS ALB with stickiness, NGINX with `ip_hash`).

---

### Mutable Messages (Edit & Delete)

Sent messages can be edited or deleted by their original sender via WebSocket events.

#### Edit a Message

| Direction       | Event            | Payload                                                    |
| --------------- | ---------------- | ---------------------------------------------------------- |
| Client → Server | `edit_message`   | `{ messageId: string, content: string }`                   |
| Server → Client | `message_edited` | `{ messageId: string, content: string, editedAt: string }` |

- Only the original sender can edit a message.
- `Message.content` is updated in MongoDB; `Message.editedAt` is set to `now`.
- The updated message is broadcast to the entire room via `message_edited`.

#### Delete a Message

| Direction       | Event             | Payload                                    |
| --------------- | ----------------- | ------------------------------------------ |
| Client → Server | `delete_message`  | `{ messageId: string }`                    |
| Server → Client | `message_deleted` | `{ messageId: string, deletedAt: string }` |

- Only the original sender (or a business owner/admin) can delete a message.
- Deletion is **soft** — `Message.deletedAt` is set; the document is retained. The content is replaced with a tombstone on the client side ("This message was deleted").
- The `message_deleted` event is broadcast to all sockets in the room so every participant's UI updates in real time.

**WsEvent additions:**

```typescript
export enum WsEvent {
  // ... existing events
  EDIT_MESSAGE = 'edit_message',
  DELETE_MESSAGE = 'delete_message',
  MESSAGE_EDITED = 'message_edited',
  MESSAGE_DELETED = 'message_deleted',
}
```

---

### File & Media Attachments in Chat

Messages support file and media attachments (images, video, documents). Attachments are uploaded to **Cloudinary** before the message is sent — the WebSocket payload carries only the resulting Cloudinary URL, keeping socket payloads small.

The upload is **non-blocking**: the multipart stream from Multer is piped directly into Cloudinary's `upload_stream` API. The file is never fully buffered in memory on the server and the Node.js event loop is not held while the upload is in progress.

**Upload flow:**

```
1. Client selects file
2. POST /messages/upload-attachment  (multipart/form-data)
       → rejects if fileSize > 10 MB (400 FILE_TOO_LARGE before any upload begins)
       → validates MIME type (400 INVALID_FILE_TYPE if unsupported)
       → streams directly to Cloudinary via upload_stream (non-blocking)
       → returns { attachmentUrl, publicId, mimeType, fileName, fileSize }
3. Client emits send_message with attachment fields included
```

**Non-blocking upload implementation:**

```typescript
// src/modules/messaging/messaging.service.ts
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

async uploadAttachment(file: Express.Multer.File, businessId: string): Promise<UploadResult> {
  if (file.size > 10 * 1024 * 1024) {
    throw new BadRequestException('File size exceeds the 10 MB limit');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder:         `attachments/${businessId}`,
        resource_type:  'auto',
        use_filename:   true,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({
          attachmentUrl: result.secure_url,
          publicId:      result.public_id,
          mimeType:      file.mimetype,
          fileName:      file.originalname,
          fileSize:      file.size,
        });
      },
    );

    Readable.from(file.buffer).pipe(uploadStream);
  });
}
```

**`send_message` payload with attachment:**

```typescript
{
  clientId:      string;
  content?:      string;           // optional caption
  attachmentUrl: string;           // Cloudinary secure URL
  publicId:      string;           // Cloudinary public_id (used for deletion)
  mimeType:      string;           // e.g. 'image/jpeg', 'application/pdf'
  fileName:      string;
  fileSize:      number;           // bytes
}
```

**Message schema additions:**

```typescript
attachmentUrl?: string;   // Cloudinary secure URL
publicId?:      string;   // Cloudinary public_id
mimeType?:      string;
fileName?:      string;
fileSize?:      number;
```

**Client-side rendering:**

The client checks `mimeType` on `message_received` to decide how to render: inline image preview for `image/*`, video player for `video/*`, a download link with icon for all other types.

---

## Central Configuration

### Redis Cache TTL

All TTL values are in **seconds** and live in a single constants file so changes propagate everywhere.

```typescript
// src/common/constants/cache-ttl.constants.ts

export const CACHE_TTL = {
  // Auth
  REFRESH_TOKEN: 60 * 60 * 24 * 7, // 7 days
  PIN_ATTEMPT: 60 * 5, // 5 minutes (rate-limit window)
  PASSWORD_RESET_TOKEN: 60 * 15, // 15 minutes

  // Dashboard / Analytics (high-read, low-write)
  DASHBOARD_STATS: 60 * 5, // 5 minutes
  REVENUE_CHART: 60 * 10, // 10 minutes
  JOB_STATUS_CHART: 60 * 5, // 5 minutes
  ANALYTICS_TRAFFIC: 60 * 10, // 10 minutes
  ANALYTICS_TOP_PAGES: 60 * 10, // 10 minutes

  // Business entities (moderate mutation rate)
  CLIENTS_LIST: 60 * 2, // 2 minutes
  CLIENT_DETAIL: 60 * 5, // 5 minutes
  JOBS_LIST: 60 * 2, // 2 minutes
  JOB_DETAIL: 60 * 5, // 5 minutes
  INVOICES_LIST: 60 * 2, // 2 minutes
  INVOICE_DETAIL: 60 * 5, // 5 minutes
  PAYMENTS_LIST: 60 * 2, // 2 minutes
  CONTRACTS_LIST: 60 * 5, // 5 minutes

  // Team
  EMPLOYEES_LIST: 60 * 5, // 5 minutes
  EMPLOYEE_DETAIL: 60 * 5, // 5 minutes
  SCHEDULES_WEEK: 60 * 3, // 3 minutes
  CLOCK_STATUS: 30, // 30 seconds (near real-time)
  TASKS_LIST: 60, // 1 minute (kanban refreshes often)

  // Reference / quasi-static
  ROLES_LIST: 60 * 30, // 30 minutes
  PERMISSIONS_LIST: 60 * 60, // 1 hour
  WEBSITE_CONFIG: 60 * 10, // 10 minutes

  // AI Insights (expensive to generate)
  AI_INSIGHTS: 60 * 60, // 1 hour

  // Activity logs (append-only, paginated — short cache)
  ACTIVITY_LOGS: 60, // 1 minute

  // WebSocket / real-time
  WS_PRESENCE: 60 * 30, // 30 minutes (rolling TTL on Redis presence set)
  WS_RATE_LIMIT: 60, // 1 minute window for per-socket rate limiting

  // Multi-tenancy — business existence + active status check
  TENANT_VALIDATION: 60 * 5, // 5 minutes

  // Subscription plan cache (checked on every guarded request)
  SUBSCRIPTION_PLAN: 60 * 5, // 5 minutes

  // Subscription limit counts (max clients, jobs, invoices per month)
  SUBSCRIPTION_LIMIT_COUNT: 60 * 2, // 2 minutes
} as const;
```

Cache keys follow the pattern: `{businessId}:{resource}:{qualifier}` e.g. `biz_123:clients:list:p1:l10`.

### Success & Error Messages

Each module owns its own message constants file. This keeps messages co-located with the feature and easy to localise later.

```typescript
// src/common/constants/messages/auth.messages.ts
export const AUTH_MESSAGES = {
  SUCCESS: {
    REGISTER: 'Account created successfully',
    LOGIN: 'Login successful',
    LOGOUT: 'Logged out successfully',
    PIN_VERIFIED: 'PIN verified successfully',
    PASSWORD_RESET_SENT: 'Password reset email sent',
    PASSWORD_RESET: 'Password has been reset successfully',
    TOKEN_REFRESHED: 'Token refreshed successfully',
  },
  ERROR: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    EMAIL_TAKEN: 'An account with this email already exists',
    INVALID_PIN: 'Incorrect PIN. Please try again',
    PIN_LOCKED: 'Too many incorrect PIN attempts. Try again in 5 minutes',
    EXPIRED_TOKEN: 'Token has expired',
    INVALID_TOKEN: 'Invalid or malformed token',
    ACCOUNT_NOT_FOUND: 'No account found with this email',
    UNAUTHORIZED: 'You are not authorized to perform this action',
    FORBIDDEN: 'You do not have permission to access this resource',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect',
  },
} as const;

// src/common/constants/messages/clients.messages.ts
export const CLIENTS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Client created successfully',
    RETRIEVED: 'Clients retrieved successfully',
    FOUND: 'Client retrieved successfully',
    UPDATED: 'Client updated successfully',
    DELETED: 'Client deleted successfully',
    DATA_EXPORTED: 'Client data exported successfully',
  },
  ERROR: {
    NOT_FOUND: 'Client not found',
    EMAIL_TAKEN: 'A client with this email already exists',
    DELETE_FAILED: 'Failed to delete client',
  },
} as const;

// src/common/constants/messages/jobs.messages.ts
export const JOBS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Job created successfully',
    RETRIEVED: 'Jobs retrieved successfully',
    FOUND: 'Job retrieved successfully',
    UPDATED: 'Job updated successfully',
    DELETED: 'Job deleted successfully',
    CONTRACT_GENERATED: 'Contract generated successfully',
    CONTRACT_SENT: 'Contract sent to client successfully',
  },
  ERROR: {
    NOT_FOUND: 'Job not found',
    CLIENT_NOT_FOUND: 'Assigned client not found',
    CONTRACT_GEN_FAILED: 'Failed to generate contract PDF',
    CONTRACT_SEND_FAILED: 'Failed to send contract email',
    BULK_DELETE_FAILED: 'Failed to delete selected jobs',
  },
} as const;

// src/common/constants/messages/invoices.messages.ts
export const INVOICES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Invoice created successfully',
    RETRIEVED: 'Invoices retrieved successfully',
    FOUND: 'Invoice retrieved successfully',
    UPDATED: 'Invoice updated successfully',
    DELETED: 'Invoice deleted successfully',
    PDF_READY: 'Invoice PDF generated successfully',
    SENT: 'Invoice sent to client successfully',
  },
  ERROR: {
    NOT_FOUND: 'Invoice not found',
    NUMBER_TAKEN: 'Invoice number already exists',
    PDF_FAILED: 'Failed to generate invoice PDF',
    SEND_FAILED: 'Failed to send invoice email',
    NO_LINE_ITEMS: 'Invoice must have at least one line item',
  },
} as const;

// src/common/constants/messages/payments.messages.ts
export const PAYMENTS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Payment recorded successfully',
    RETRIEVED: 'Payments retrieved successfully',
    FOUND: 'Payment retrieved successfully',
    UPDATED: 'Payment updated successfully',
    DELETED: 'Payment deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'Payment not found',
    INVALID_AMOUNT: 'Payment amount must be greater than zero',
  },
} as const;

// src/common/constants/messages/employees.messages.ts
export const EMPLOYEES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Employee added successfully',
    RETRIEVED: 'Employees retrieved successfully',
    FOUND: 'Employee retrieved successfully',
    UPDATED: 'Employee updated successfully',
    DELETED: 'Employee removed successfully',
    CLOCK_HISTORY: 'Clock history retrieved successfully',
    ONLINE_LIST: 'Online employees retrieved successfully',
  },
  ERROR: {
    NOT_FOUND: 'Employee not found',
    EMAIL_TAKEN: 'An employee with this email already exists',
  },
  PRESENCE: {
    SUCCESS: {
      CONNECTED: 'Connected to presence channel',
      ONLINE_LIST: 'Online employees retrieved',
      USER_ONLINE: 'Employee came online',
      USER_OFFLINE: 'Employee went offline',
    },
    ERROR: {
      AUTH_FAILED: 'Presence authentication failed',
      BUSINESS_MISMATCH: 'Business ID does not match token',
      REDIS_UNAVAILABLE: 'Presence service temporarily unavailable',
    },
  },
} as const;

// src/common/constants/messages/time-tracking.messages.ts
export const TIME_TRACKING_MESSAGES = {
  SUCCESS: {
    CLOCKED_IN: 'Clocked in successfully',
    CLOCKED_OUT: 'Clocked out successfully',
    BREAK_STARTED: 'Break started',
    BREAK_ENDED: 'Break ended',
    STATUS: 'Clock status retrieved',
  },
  ERROR: {
    ALREADY_CLOCKED_IN: 'Employee is already clocked in',
    NOT_CLOCKED_IN: 'Employee is not currently clocked in',
    ALREADY_ON_BREAK: 'Employee is already on a break',
    NOT_ON_BREAK: 'Employee is not currently on a break',
    EMPLOYEE_NOT_FOUND: 'Employee not found',
  },
} as const;

// src/common/constants/messages/schedules.messages.ts
export const SCHEDULES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Shift created successfully',
    RETRIEVED: 'Schedule retrieved successfully',
    UPDATED: 'Shift updated successfully',
    DELETED: 'Shift deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'Shift not found',
    CONFLICT: 'Employee already has a shift overlapping this time slot',
  },
} as const;

// src/common/constants/messages/tasks.messages.ts
export const TASKS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Task created successfully',
    RETRIEVED: 'Tasks retrieved successfully',
    FOUND: 'Task retrieved successfully',
    UPDATED: 'Task updated successfully',
    DELETED: 'Task deleted successfully',
    COMMENT_ADDED: 'Comment added successfully',
    SUBTASK_ADDED: 'Subtask added successfully',
    SUBTASK_UPDATED: 'Subtask updated successfully',
  },
  ERROR: {
    NOT_FOUND: 'Task not found',
    SUBTASK_NOT_FOUND: 'Subtask not found',
    ASSIGNEE_NOT_FOUND: 'Assigned employee not found',
  },
} as const;

// src/common/constants/messages/requests.messages.ts
export const REQUESTS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Service request submitted successfully',
    RETRIEVED: 'Service requests retrieved successfully',
    FOUND: 'Service request retrieved successfully',
    UPDATED: 'Service request updated successfully',
    ACCEPTED: 'Service request accepted successfully',
    REJECTED: 'Service request rejected',
    CANCELLED: 'Service request cancelled',
    DELETED: 'Service request deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'Service request not found',
    ALREADY_ACTIONED: 'This request has already been actioned',
  },
} as const;

// src/common/constants/messages/messaging.messages.ts
export const MESSAGING_MESSAGES = {
  SUCCESS: {
    MESSAGE_SENT: 'Message sent successfully',
    MESSAGES_RETRIEVED: 'Messages retrieved successfully',
    ANNOUNCEMENT_CREATED: 'Announcement created successfully',
    ANNOUNCEMENTS_RETRIEVED: 'Announcements retrieved successfully',
    TEAM_MESSAGE_SENT: 'Team message sent successfully',
  },
  ERROR: {
    CLIENT_NOT_FOUND: 'Client not found for messaging',
    SEND_FAILED: 'Failed to send message',
  },
} as const;

// src/common/constants/messages/roles.messages.ts
export const ROLES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Role created successfully',
    RETRIEVED: 'Roles retrieved successfully',
    FOUND: 'Role retrieved successfully',
    UPDATED: 'Role updated successfully',
    DELETED: 'Role deleted successfully',
    PERMISSIONS_RETRIEVED: 'Permissions retrieved successfully',
  },
  ERROR: {
    NOT_FOUND: 'Role not found',
    NAME_TAKEN: 'A role with this name already exists',
    DEFAULT_ROLE: 'Default roles cannot be deleted',
    INVALID_PERMISSION: 'One or more permissions are invalid',
  },
} as const;

// src/common/constants/messages/activity-logs.messages.ts
export const ACTIVITY_LOGS_MESSAGES = {
  SUCCESS: {
    RETRIEVED: 'Activity logs retrieved successfully',
  },
  ERROR: {
    RETRIEVAL_FAILED: 'Failed to retrieve activity logs',
  },
} as const;

// src/common/constants/messages/website.messages.ts
export const WEBSITE_MESSAGES = {
  SUCCESS: {
    RETRIEVED: 'Website configuration retrieved successfully',
    UPDATED: 'Website updated successfully',
    PUBLISHED: 'Website published successfully',
    UNPUBLISHED: 'Website unpublished successfully',
    BOOKING_CREATED: 'Booking request submitted successfully',
    GENERATED: 'Website generation started',
  },
  ERROR: {
    NOT_FOUND: 'Website configuration not found',
    PUBLISH_FAILED: 'Failed to publish website',
    INVALID_FIELD: 'Invalid booking form field configuration',
    BOOKING_FAILED: 'Failed to submit booking request',
  },
} as const;

// src/common/constants/messages/analytics.messages.ts
export const ANALYTICS_MESSAGES = {
  SUCCESS: {
    TRAFFIC_RETRIEVED: 'Traffic analytics retrieved successfully',
    REVENUE_RETRIEVED: 'Revenue data retrieved successfully',
    JOBS_RETRIEVED: 'Jobs analytics retrieved successfully',
  },
  ERROR: {
    RETRIEVAL_FAILED: 'Failed to retrieve analytics data',
  },
} as const;

// src/common/constants/messages/ai.messages.ts
export const AI_MESSAGES = {
  SUCCESS: {
    INSIGHTS_GENERATED: 'AI insights generated successfully',
    ADVISOR_RESPONSE: 'AI advisor responded successfully',
    DESCRIPTION_GENERATED: 'Business description generated successfully',
    WEBSITE_GENERATION_STARTED: 'Website generation started',
  },
  ERROR: {
    INSIGHTS_FAILED: 'Failed to generate AI insights',
    ADVISOR_FAILED: 'AI advisor encountered an error',
    AI_UNAVAILABLE: 'AI service is currently unavailable',
    RATE_LIMITED: 'Too many AI requests. Please wait before trying again',
  },
} as const;

// src/common/constants/messages/files.messages.ts
export const FILES_MESSAGES = {
  SUCCESS: {
    UPLOADED: 'File uploaded successfully',
    RETRIEVED: 'Files retrieved successfully',
    FOUND: 'File retrieved successfully',
    DELETED: 'File deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'File not found',
    UPLOAD_FAILED: 'File upload failed',
    INVALID_TYPE: 'Invalid file type. Only PDF and DOC files are allowed',
    SIZE_EXCEEDED: 'File size exceeds the 10 MB limit',
  },
} as const;

// src/common/constants/messages/contracts.messages.ts
export const CONTRACTS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Contract created successfully',
    RETRIEVED: 'Contracts retrieved successfully',
    FOUND: 'Contract retrieved successfully',
    UPDATED: 'Contract updated successfully',
    DELETED: 'Contract deleted successfully',
    PDF_READY: 'Contract PDF generated successfully',
    SENT: 'Contract sent to client successfully',
  },
  ERROR: {
    NOT_FOUND: 'Contract not found',
    PDF_FAILED: 'Failed to generate contract PDF',
    SEND_FAILED: 'Failed to send contract email',
  },
} as const;

// src/common/constants/messages/settings.messages.ts
export const SETTINGS_MESSAGES = {
  SUCCESS: {
    PROFILE_UPDATED: 'Business profile updated successfully',
    PROFILE_RETRIEVED: 'Business profile retrieved successfully',
    PASSWORD_UPDATED: 'Password updated successfully',
    NOTIFICATIONS_UPDATED: 'Notification preferences updated successfully',
    NOTIFICATIONS_RETRIEVED: 'Notification preferences retrieved successfully',
    SUBSCRIPTION_UPDATED: 'Subscription updated successfully',
    ACCOUNT_DELETED: 'Account deleted successfully',
  },
  ERROR: {
    PROFILE_NOT_FOUND: 'Business profile not found',
    ACCOUNT_DELETE_FAILED: 'Failed to delete account',
    INVALID_PASSWORD: 'Password confirmation failed',
  },
} as const;

// src/common/constants/messages/subscription.messages.ts
export const SUBSCRIPTION_MESSAGES = {
  SUCCESS: {
    UPDATED: 'Subscription plan updated successfully',
    RETRIEVED: 'Subscription details retrieved successfully',
  },
  ERROR: {
    PLAN_REQUIRED: (requiredPlan: string) =>
      `This feature requires the ${requiredPlan} plan or higher. Please upgrade your subscription`,
    CLIENT_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max}-client limit for your current plan. Upgrade to add more clients`,
    JOB_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max} jobs/month limit for your current plan. Upgrade to create more jobs`,
    INVOICE_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max} invoices/month limit for your current plan. Upgrade to create more invoices`,
    EMPLOYEE_LIMIT_REACHED: (max: number) =>
      `Your plan supports a maximum of ${max} employee(s). Upgrade to add more team members`,
    STORAGE_LIMIT_REACHED: (maxGb: number) =>
      `You have used all ${maxGb} GB of storage included in your plan. Upgrade to upload more files`,
    PLAN_NOT_FOUND: 'Subscription plan not found',
    DOWNGRADE_CONFLICT:
      'Cannot downgrade: your current usage exceeds the limits of the target plan',
  },
} as const;

// src/common/constants/messages/tenant.messages.ts
export const TENANT_MESSAGES = {
  ERROR: {
    MISSING_HEADER: 'Missing required X-Business-Id header',
    INVALID_FORMAT: 'X-Business-Id must be a valid MongoDB ObjectId',
    NOT_FOUND: 'Business not found',
    INACTIVE: 'This business account has been deactivated',
    MISMATCH: "X-Business-Id does not match the authenticated user's business",
    DELETED: 'This business account no longer exists',
    EMPLOYEE_MISMATCH:
      'The authenticated employee does not belong to the specified business',
  },
} as const;

// src/common/constants/messages/websocket.messages.ts
export const WEBSOCKET_MESSAGES = {
  SUCCESS: {
    CONNECTED: 'Connected to chat',
    ROOM_JOINED: 'Joined conversation room',
    ROOM_LEFT: 'Left conversation room',
    MESSAGE_SENT: 'Message sent',
    MARKED_READ: 'Messages marked as read',
  },
  ERROR: {
    // Connection-level (emitted before disconnect)
    MISSING_TOKEN: 'Missing authentication token',
    INVALID_TOKEN: 'Invalid or expired authentication token',
    MISSING_BUSINESS_ID: 'Missing businessId in handshake auth',
    TENANT_MISMATCH: 'businessId does not match the authenticated user',
    BUSINESS_NOT_FOUND: 'Business not found or deactivated',

    // Event-level (emitted as error event to the socket)
    INVALID_CLIENT_ID:
      'Invalid clientId — client does not belong to this business',
    EMPTY_CONTENT: 'Message content cannot be empty',
    CONTENT_TOO_LONG: 'Message content exceeds the 4000 character limit',
    ROOM_NOT_JOINED: 'You must join the room before sending messages',
    RATE_LIMITED: 'Too many messages. Please slow down',
    INTERNAL: 'An internal server error occurred',
  },
} as const;
```

---

## Database Models

All schemas use Typegoose. Every document carries `businessId` (soft multi-tenancy at the document level — all queries are scoped to the authenticated user's business).

### Indexes

Defined inline on schema classes. Additional compound indexes are declared in `createIndexes()` bootstrap hooks.

---

### User Schema

```typescript
// src/modules/users/schemas/user.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum UserRole {
  OWNER = 'owner',
  EMPLOYEE = 'employee',
}

@index({ email: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'users', timestamps: true } })
export class User {
  @prop({ required: true, trim: true })
  firstName: string;

  @prop({ required: true, trim: true })
  lastName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ required: true })
  passwordHash: string;

  @prop({ required: true })
  pinHash: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ enum: UserRole, default: UserRole.OWNER })
  userRole: UserRole;

  /** Reference to the Business this user owns or belongs to */
  @prop({ ref: 'Business', type: Types.ObjectId })
  businessId?: Types.ObjectId;

  /** For employee-type users, their associated Employee document */
  @prop({ ref: 'Employee', type: Types.ObjectId })
  employeeId?: Types.ObjectId;

  /** Role (permission set) assigned to this user */
  @prop({ ref: 'Role', type: Types.ObjectId })
  roleId?: Types.ObjectId;

  @prop({ default: false })
  isActive: boolean;

  @prop({ default: false })
  isEmailVerified: boolean;

  @prop()
  lastLoginAt?: Date;

  @prop()
  deletedAt?: Date;
}

export const UserModel = getModelForClass(User);
```

---

### Business Schema

```typescript
// src/modules/business/schemas/business.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum BusinessCategory {
  CLEANING = 'cleaning',
  PLUMBING = 'plumbing',
  ELECTRICAL = 'electrical',
  HVAC = 'hvac',
  LANDSCAPING = 'landscaping',
  PAINTING = 'painting',
  CARPENTRY = 'carpentry',
  GENERAL = 'general_contracting',
}

export enum SubscriptionPlan {
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  TRIALING = 'trialing', // 1-month free trial, no payment required
  ACTIVE = 'active', // paid and current
  GRACE_PERIOD = 'grace_period', // payment failed — 5-day window to recover
  LOCKED = 'locked', // trial expired or grace period exhausted
  CANCELED = 'canceled', // explicitly canceled by the business
}

class ColorScheme {
  @prop({ default: '#2563eb' }) primary: string;
  @prop({ default: '#64748b' }) secondary: string;
}

class NotificationPreferences {
  @prop({ default: true }) email: boolean;
  @prop({ default: true }) newClient: boolean;
  @prop({ default: true }) payment: boolean;
}

@index({ ownerId: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'businesses', timestamps: true } })
export class Business {
  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  ownerId: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ enum: BusinessCategory, required: true })
  category: BusinessCategory;

  @prop({ trim: true })
  description?: string;

  @prop({ trim: true })
  email?: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ trim: true })
  address?: string;

  @prop({ type: () => ColorScheme, _id: false, default: () => ({}) })
  colors: ColorScheme;

  @prop({ default: 'Inter' })
  font: string;

  @prop({ type: () => [String], default: [] })
  services: string[];

  @prop({ enum: SubscriptionPlan, default: SubscriptionPlan.STARTER })
  subscriptionPlan: SubscriptionPlan;

  @prop({ enum: SubscriptionStatus, default: SubscriptionStatus.TRIALING })
  subscriptionStatus: SubscriptionStatus;

  @prop()
  trialEndsAt?: Date; // set to now + 1 month on registration

  @prop()
  currentPeriodEnd?: Date; // end of current paid billing period (from Stripe)

  @prop()
  gracePeriodEndsAt?: Date; // set to currentPeriodEnd + 5 days on payment failure

  @prop({
    type: () => NotificationPreferences,
    _id: false,
    default: () => ({}),
  })
  notifications: NotificationPreferences;

  @prop()
  deletedAt?: Date;
}

export const BusinessModel = getModelForClass(Business);
```

---

### Client Schema

```typescript
// src/modules/clients/schemas/client.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, email: 1 }, { unique: true })
@index({ businessId: 1, fullName: 'text', email: 'text' })
@modelOptions({ schemaOptions: { collection: 'clients', timestamps: true } })
export class Client {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true, trim: true })
  fullName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ trim: true })
  jobLocation?: string;

  @prop({ default: 0, min: 0 })
  totalSpent: number;

  @prop({ default: 0, min: 0 })
  defaultRate: number;

  @prop()
  notes?: string;

  @prop()
  deletedAt?: Date;
}

export const ClientModel = getModelForClass(Client);
```

---

### Job Schema

```typescript
// src/modules/jobs/schemas/job.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@index({ businessId: 1, status: 1 })
@index({ businessId: 1, clientId: 1 })
@index({ businessId: 1, title: 'text' })
@modelOptions({ schemaOptions: { collection: 'jobs', timestamps: true } })
export class Job {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ required: true, trim: true })
  title: string;

  @prop({ trim: true })
  description?: string;

  @prop({ required: true })
  scheduledDate: Date;

  @prop({ enum: JobStatus, default: JobStatus.PENDING })
  status: JobStatus;

  @prop({ trim: true })
  location?: string;

  @prop({ default: 0, min: 0 })
  price: number;

  @prop()
  notes?: string;

  @prop({ default: false })
  contractRequired: boolean;

  @prop({ ref: 'Contract', type: Types.ObjectId })
  contractId?: Types.ObjectId;

  @prop()
  completedAt?: Date;

  @prop()
  deletedAt?: Date;
}

export const JobModel = getModelForClass(Job);
```

---

### Invoice Schema

```typescript
// src/modules/invoices/schemas/invoice.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum InvoiceStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
}

class LineItem {
  @prop({ required: true, trim: true }) description: string;
  @prop({ required: true, min: 1 }) quantity: number;
  @prop({ required: true, min: 0 }) unitPrice: number;
}

@index({ businessId: 1, status: 1 })
@index({ businessId: 1, clientId: 1 })
@index({ businessId: 1, invoiceNumber: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'invoices', timestamps: true } })
export class Invoice {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ required: true, trim: true })
  invoiceNumber: string;

  @prop({ enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status: InvoiceStatus;

  @prop({ required: true })
  invoiceDate: Date;

  @prop()
  dueDate?: Date;

  @prop({ type: () => [LineItem], _id: false, default: [] })
  lineItems: LineItem[];

  @prop({ default: 0, min: 0, max: 100 })
  taxRate: number;

  /** Cached total = sum(qty * unitPrice) * (1 + taxRate/100) */
  @prop({ default: 0 })
  totalAmount: number;

  @prop({ default: 0 })
  amountPaid: number;

  @prop({ ref: 'Job', type: Types.ObjectId })
  jobId?: Types.ObjectId;

  @prop()
  pdfUrl?: string;

  @prop()
  sentAt?: Date;

  @prop()
  deletedAt?: Date;
}

export const InvoiceModel = getModelForClass(Invoice);
```

---

### Payment Schema

```typescript
// src/modules/payments/schemas/payment.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum PaymentMode {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  CHEQUE = 'cheque',
  MOBILE_MONEY = 'mobile_money',
}

export enum PaymentStatus {
  COMPLETED = 'completed',
  PARTIAL = 'partial',
}

@index({ businessId: 1, paymentDate: -1 })
@index({ businessId: 1, invoiceId: 1 })
@modelOptions({ schemaOptions: { collection: 'payments', timestamps: true } })
export class Payment {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Invoice', type: Types.ObjectId })
  invoiceId?: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId })
  clientId?: Types.ObjectId;

  @prop({ trim: true })
  businessName?: string;

  @prop({ required: true })
  paymentDate: Date;

  @prop({ enum: PaymentMode, required: true })
  paymentMode: PaymentMode;

  @prop({ required: true, min: 0 })
  amount: number;

  @prop({ enum: PaymentStatus, default: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @prop()
  notes?: string;

  @prop()
  deletedAt?: Date;
}

export const PaymentModel = getModelForClass(Payment);
```

---

### Employee Schema

```typescript
// src/modules/employees/schemas/employee.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, email: 1 }, { unique: true })
@index({ businessId: 1, fullName: 'text' })
@modelOptions({ schemaOptions: { collection: 'employees', timestamps: true } })
export class Employee {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  /** Linked user account (set after employee accepts invite) */
  @prop({ ref: 'User', type: Types.ObjectId })
  userId?: Types.ObjectId;

  @prop({ ref: 'Role', type: Types.ObjectId, required: true })
  roleId: Types.ObjectId;

  @prop({ required: true, trim: true })
  fullName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ default: 40 })
  weeklyHoursTarget: number;

  @prop()
  dateJoined?: Date;

  @prop()
  deletedAt?: Date;
}

export const EmployeeModel = getModelForClass(Employee);
```

---

### Clock Record Schema

```typescript
// src/modules/time-tracking/schemas/clock-record.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum ClockStatus {
  CLOCKED_IN = 'clocked_in',
  CLOCKED_OUT = 'clocked_out',
  ON_BREAK = 'on_break',
}

@index({ employeeId: 1, clockInAt: -1 })
@index({ businessId: 1, clockInAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'clock_records', timestamps: true },
})
export class ClockRecord {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  employeeId: Types.ObjectId;

  @prop({ required: true })
  clockInAt: Date;

  @prop()
  clockOutAt?: Date;

  @prop({ default: 0, min: 0 })
  breakMinutes: number;

  /** Computed: (clockOutAt - clockInAt) / 3600000 - breakMinutes/60 */
  @prop({ default: 0 })
  totalHours: number;

  @prop({ enum: ClockStatus, default: ClockStatus.CLOCKED_IN })
  status: ClockStatus;

  @prop()
  breakStartedAt?: Date;
}

export const ClockRecordModel = getModelForClass(ClockRecord);
```

---

### Shift Schema

```typescript
// src/modules/schedules/schemas/shift.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, weekStartDate: 1 })
@index({ employeeId: 1, weekStartDate: 1 })
@modelOptions({ schemaOptions: { collection: 'shifts', timestamps: true } })
export class Shift {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  employeeId: Types.ObjectId;

  /** ISO date string of the shift date (YYYY-MM-DD) */
  @prop({ required: true })
  shiftDate: Date;

  /** HH:mm format */
  @prop({ required: true })
  startTime: string;

  @prop({ required: true })
  endTime: string;

  @prop()
  notes?: string;

  /** The Monday of the week this shift belongs to (for efficient week queries) */
  @prop({ required: true })
  weekStartDate: Date;
}

export const ShiftModel = getModelForClass(Shift);
```

---

### Task Schema

```typescript
// src/modules/tasks/schemas/task.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum TaskStage {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TaskStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
}

class Subtask {
  @prop({ required: true }) _id: Types.ObjectId;
  @prop({ required: true }) title: string;
  @prop({ default: false }) completed: boolean;
}

class TaskComment {
  @prop({ required: true }) _id: Types.ObjectId;
  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  authorId: Types.ObjectId;
  @prop({ required: true }) authorName: string;
  @prop({ required: true }) content: string;
  @prop({ default: Date.now }) createdAt: Date;
}

@index({ businessId: 1, stage: 1, status: 1 })
@index({ assigneeId: 1, stage: 1 })
@modelOptions({ schemaOptions: { collection: 'tasks', timestamps: true } })
export class Task {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  assigneeId: Types.ObjectId;

  @prop({ required: true, trim: true })
  title: string;

  @prop({ trim: true })
  description?: string;

  @prop({ enum: TaskStage, default: TaskStage.TODO })
  stage: TaskStage;

  @prop({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @prop({ enum: TaskStatus, default: TaskStatus.ACTIVE })
  status: TaskStatus;

  @prop()
  dueDate?: Date;

  @prop({ type: () => [Subtask], _id: false, default: [] })
  subtasks: Subtask[];

  @prop({ type: () => [TaskComment], _id: false, default: [] })
  comments: TaskComment[];

  @prop()
  deletedAt?: Date;
}

export const TaskModel = getModelForClass(Task);
```

---

### Service Request Schema

```typescript
// src/modules/requests/schemas/service-request.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum RequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@index({ businessId: 1, status: 1 })
@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'service_requests', timestamps: true },
})
export class ServiceRequest {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  /** Created when request is accepted and converted to a client record */
  @prop({ ref: 'Client', type: Types.ObjectId })
  clientId?: Types.ObjectId;

  @prop({ required: true, trim: true })
  clientName: string;

  @prop({ required: true, lowercase: true, trim: true })
  clientEmail: string;

  @prop({ trim: true })
  clientPhone?: string;

  @prop({ required: true, trim: true })
  service: string;

  @prop({ required: true })
  requestedDate: Date;

  @prop()
  requestedEndDate?: Date;

  @prop()
  message?: string;

  @prop({ enum: RequestStatus, default: RequestStatus.PENDING })
  status: RequestStatus;

  @prop({ min: 0 })
  quotedPrice?: number;

  @prop()
  actionedAt?: Date;

  @prop()
  actionedBy?: Types.ObjectId;

  @prop()
  deletedAt?: Date;
}

export const ServiceRequestModel = getModelForClass(ServiceRequest);
```

---

### Message Schema

```typescript
// src/modules/messaging/schemas/message.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum MessageSender {
  BUSINESS = 'business',
  CLIENT = 'client',
}

export enum MessageStatus {
  SENT = 'sent', // persisted to DB
  DELIVERED = 'delivered', // recipient socket received it
  READ = 'read', // recipient opened the conversation
}

@index({ businessId: 1, clientId: 1, createdAt: -1 })
@index({ conversationId: 1, createdAt: -1 })
@modelOptions({ schemaOptions: { collection: 'messages', timestamps: true } })
export class Message {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  /** FK to the Conversation document for this business–client thread */
  @prop({ ref: 'Conversation', type: Types.ObjectId, required: true })
  conversationId: Types.ObjectId;

  @prop({ enum: MessageSender, required: true })
  sender: MessageSender;

  @prop({ required: true })
  senderName: string;

  @prop({ required: true })
  content: string;

  @prop({ enum: MessageStatus, default: MessageStatus.SENT })
  status: MessageStatus;

  /** Set when the recipient's socket acknowledges receipt */
  @prop()
  deliveredAt?: Date;

  /** Set when the recipient opens the conversation */
  @prop()
  readAt?: Date;
}

export const MessageModel = getModelForClass(Message);
```

---

### Conversation Schema

Tracks the per-thread metadata (last message, unread count) so the inbox list can be built without aggregating the full messages collection.

```typescript
// src/modules/messaging/schemas/conversation.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, clientId: 1 }, { unique: true })
@index({ businessId: 1, updatedAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'conversations', timestamps: true },
})
export class Conversation {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ default: '' })
  lastMessageContent: string;

  @prop()
  lastMessageAt?: Date;

  @prop({ default: MessageSender.BUSINESS })
  lastMessageSender: MessageSender;

  /** Unread count for the business side (messages sent by client, not yet read) */
  @prop({ default: 0 })
  businessUnreadCount: number;

  /** Unread count for the client side (messages sent by business, not yet read) */
  @prop({ default: 0 })
  clientUnreadCount: number;

  /** True if either participant is currently connected to this room */
  @prop({ default: false })
  isActive: boolean;
}

export const ConversationModel = getModelForClass(Conversation);
```

---

### Team Chat Schemas

```typescript
// src/modules/messaging/schemas/team-message.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'team_messages', timestamps: true },
})
export class TeamMessage {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  senderId: Types.ObjectId;

  @prop({ required: true })
  senderName: string;

  @prop({ required: true })
  content: string;
}

export const TeamMessageModel = getModelForClass(TeamMessage);

// src/modules/messaging/schemas/announcement.schema.ts
@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'announcements', timestamps: true },
})
export class Announcement {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  authorId: Types.ObjectId;

  @prop({ required: true })
  authorName: string;

  @prop({ required: true, trim: true })
  title: string;

  @prop({ required: true })
  description: string;
}

export const AnnouncementModel = getModelForClass(Announcement);
```

---

### Role & Permission Schema

```typescript
// src/modules/roles/schemas/role.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export const ALL_PERMISSIONS = [
  'dashboard.view',
  'clients.view',
  'clients.create',
  'clients.edit',
  'clients.delete',
  'invoices.view',
  'invoices.create',
  'invoices.edit',
  'invoices.delete',
  'jobs.view',
  'jobs.create',
  'jobs.edit',
  'jobs.delete',
  'contracts.view',
  'contracts.create',
  'contracts.edit',
  'contracts.delete',
  'roles.view',
  'roles.create',
  'roles.edit',
  'roles.delete',
  'payments.view',
  'payments.create',
  'payments.edit',
  'payments.delete',
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'requests.view',
  'requests.create',
  'requests.edit',
  'requests.delete',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'tasks.delete',
  'reports.view',
  'settings.view',
  'settings.edit',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

@index({ businessId: 1, name: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'roles', timestamps: true } })
export class Role {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ type: () => [String], default: [] })
  permissions: Permission[];

  /** System-defined roles cannot be deleted */
  @prop({ default: false })
  isDefault: boolean;
}

export const RoleModel = getModelForClass(Role);
```

---

### Activity Log Schema

```typescript
// src/modules/activity-logs/schemas/activity-log.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum LogCategory {
  AUTH = 'auth',
  CLIENT = 'client',
  JOB = 'job',
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  SETTINGS = 'settings',
  ROLE = 'role',
  EMPLOYEE = 'employee',
  TASK = 'task',
  REQUEST = 'request',
  WEBSITE = 'website',
}

@index({ businessId: 1, category: 1, createdAt: -1 })
@index({ businessId: 1, actorId: 1 })
@modelOptions({
  schemaOptions: { collection: 'activity_logs', timestamps: true },
})
export class ActivityLog {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  actorId: Types.ObjectId;

  @prop({ required: true })
  actorName: string;

  @prop({ required: true })
  actorRole: string;

  @prop({ required: true })
  action: string;

  @prop({ enum: LogCategory, required: true })
  category: LogCategory;

  /** ID of the affected resource */
  @prop({ type: Types.ObjectId })
  resourceId?: Types.ObjectId;

  @prop()
  resourceType?: string;

  /** Snapshot of request metadata for security auditing */
  @prop()
  ipAddress?: string;

  @prop()
  userAgent?: string;
}

export const ActivityLogModel = getModelForClass(ActivityLog);
```

---

### Website Schema

```typescript
// src/modules/website/schemas/website.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum BookingFieldType {
  TEXT = 'text',
  EMAIL = 'email',
  TEL = 'tel',
  TEXTAREA = 'textarea',
  DATE = 'date',
  SELECT = 'select',
}

class WebsiteColors {
  @prop({ default: '#2563eb' }) primary: string;
  @prop({ default: '#64748b' }) secondary: string;
}

class BookingFormField {
  @prop({ required: true }) fieldId: string;
  @prop({ required: true }) label: string;
  @prop({ enum: BookingFieldType, required: true }) type: BookingFieldType;
  @prop({ default: '' }) placeholder: string;
  @prop({ default: false }) required: boolean;
  @prop({ type: () => [String], default: [] }) options: string[];
  @prop({ default: 0 }) order: number;
}

@index({ businessId: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'websites', timestamps: true } })
export class Website {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ default: false })
  published: boolean;

  @prop()
  subdomain?: string;

  @prop()
  customDomain?: string;

  @prop()
  publishedUrl?: string;

  @prop({ default: '' }) heroTitle: string;
  @prop({ default: '' }) heroSubtitle: string;
  @prop({ default: '' }) aboutUs: string;
  @prop({ default: '' }) contactInfo: string;
  @prop({ default: '' }) heroImageUrl: string;

  @prop({ type: () => WebsiteColors, _id: false, default: () => ({}) })
  colors: WebsiteColors;

  @prop({ default: 'Inter' })
  font: string;

  @prop({ default: '' })
  siteName: string;

  @prop({ type: () => [BookingFormField], _id: false, default: [] })
  bookingFormFields: BookingFormField[];

  @prop()
  publishedAt?: Date;
}

export const WebsiteModel = getModelForClass(Website);
```

---

### Booking Schema

```typescript
// src/modules/website/schemas/booking.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum BookingStatus {
  NEW = 'new',
  CONVERTED = 'converted', // converted to a ServiceRequest
  DISMISSED = 'dismissed',
}

@index({ businessId: 1, status: 1, createdAt: -1 })
@modelOptions({ schemaOptions: { collection: 'bookings', timestamps: true } })
export class Booking {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  /** Free-form field values from the booking form */
  @prop({ type: () => Object })
  formData: Record<string, string>;

  @prop({ enum: BookingStatus, default: BookingStatus.NEW })
  status: BookingStatus;

  @prop({ ref: 'ServiceRequest', type: Types.ObjectId })
  serviceRequestId?: Types.ObjectId;

  @prop()
  ipAddress?: string;
}

export const BookingModel = getModelForClass(Booking);
```

---

### Contract Schema

```typescript
// src/modules/contracts/schemas/contract.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum ContractStatus {
  PENDING = 'pending',
  SENT = 'sent',
  SIGNED = 'signed',
  EXPIRED = 'expired',
}

@index({ businessId: 1, clientId: 1 })
@index({ businessId: 1, status: 1 })
@modelOptions({ schemaOptions: { collection: 'contracts', timestamps: true } })
export class Contract {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ ref: 'Job', type: Types.ObjectId })
  jobId?: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ default: 0, min: 0 })
  amount: number;

  @prop({ enum: ContractStatus, default: ContractStatus.PENDING })
  status: ContractStatus;

  @prop()
  pdfUrl?: string;

  @prop()
  sentAt?: Date;

  @prop()
  signedAt?: Date;

  @prop()
  expiresAt?: Date;

  @prop()
  deletedAt?: Date;
}

export const ContractModel = getModelForClass(Contract);
```

---

### Client File Schema

```typescript
// src/modules/files/schemas/client-file.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum FileFormat {
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  PNG = 'png',
  JPG = 'jpg',
}

@index({ businessId: 1, clientId: 1 })
@modelOptions({
  schemaOptions: { collection: 'client_files', timestamps: true },
})
export class ClientFile {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ required: true })
  filename: string;

  @prop({ required: true })
  cloudinaryPublicId: string;

  @prop({ required: true })
  url: string;

  @prop({ enum: FileFormat })
  format: FileFormat;

  @prop({ default: 0 })
  filesizeBytes: number;

  @prop({ ref: 'User', type: Types.ObjectId })
  uploadedBy?: Types.ObjectId;

  @prop()
  deletedAt?: Date;
}

export const ClientFileModel = getModelForClass(ClientFile);
```

---

### Refresh Token Schema

```typescript
// src/modules/auth/schemas/refresh-token.schema.ts

import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ userId: 1 })
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL index — Mongo auto-removes expired docs
@modelOptions({
  schemaOptions: { collection: 'refresh_tokens', timestamps: true },
})
export class RefreshToken {
  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @prop({ required: true })
  tokenHash: string;

  @prop({ required: true })
  expiresAt: Date;

  @prop({ default: false })
  revoked: boolean;

  @prop()
  ipAddress?: string;

  @prop()
  userAgent?: string;
}

export const RefreshTokenModel = getModelForClass(RefreshToken);
```

---

## API Endpoints

**Base URL:** `https://api.servixos.com`

### Required Headers

Every **protected** endpoint requires:

```
Authorization:  Bearer <accessToken>
X-Business-Id:  <MongoDB ObjectId of the business>
```

The `X-Business-Id` header is the primary multi-tenancy identifier. It is validated on every protected request by the `TenantGuard` — verified to:

1. Be present and a valid ObjectId format.
2. Correspond to an existing, active, non-deleted `Business` document.
3. Match the `businessId` claim embedded in the JWT — preventing a user from accessing another business by substituting the header value.

All downstream services and repositories use the `businessId` from this validated header (attached to `req.tenant`) as the mandatory scope for every database query. No query ever relies on a `businessId` supplied in a request body or query string.

---

### Auth Module

#### `POST /auth/register`

Registers a new owner, creates their Business document, generates default roles (Owner, Manager, Employee), and seeds a Website config.

**Request Body:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+12025550100",
  "password": "SecurePass1!",
  "pin": "4821",
  "businessName": "John's Plumbing",
  "businessCategory": "plumbing",
  "businessDescription": "Licensed plumber serving the DC metro area.",
  "colorPrimary": "#2563eb",
  "colorSecondary": "#64748b",
  "font": "Inter",
  "services": ["Pipe Repair", "Drain Cleaning", "Water Heater Installation"]
}
```

**Validations:**

- `email` — valid email format, not already registered
- `password` — min 8 chars, at least one uppercase, one number
- `pin` — exactly 4 digits
- `businessCategory` — must be a valid `BusinessCategory` enum value

**Response `201`:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Account created successfully",
  "data": {
    "userId": "...",
    "businessId": "...",
    "email": "john@example.com",
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

**Error responses:** `400` (validation), `409` (email taken)

---

#### `POST /auth/login`

**Request Body:**

```json
{ "email": "john@example.com", "password": "SecurePass1!" }
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "businessId": "...",
      "mustChangePassword": false
    }
  }
}
```

**Integration notes:**

- `accessToken` returned from `/auth/login` is issued with `pinVerified: false` for owner/employee auth flow.
- For invited employees, `mustChangePassword` will be `true` on first login.

**Error responses:** `401` (invalid credentials)

---

#### `POST /auth/verify-pin`

Used after login to exchange an access token with `pinVerified: false` for a new access token with `pinVerified: true`.

**Headers:**

```http
Authorization: Bearer <accessToken from /auth/login>
```

**Request Body:**

```json
{ "pin": "4821" }
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Verified successfully",
  "data": { "accessToken": "..." }
}
```

**Error responses:** `401` (`INVALID_PIN`, `PIN_LOCKED`, `EXPIRED_TOKEN`)

---

#### `POST /auth/complete-setup`

For invited **employee** users on first login (`mustChangePassword: true`), this endpoint sets their permanent password and their PIN in one request.

**Headers:**

```http
Authorization: Bearer <accessToken from /auth/login>
```

**Request Body:**

```json
{
  "newPassword": "EmployeeNew123",
  "confirmPassword": "EmployeeNew123",
  "pin": "7788",
  "confirmPin": "7788"
}
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Account setup completed successfully",
  "data": { "accessToken": "..." }
}
```

**Error responses:** `400` (`SETUP_NOT_REQUIRED`), `401` (`UNAUTHORIZED`, `EXPIRED_TOKEN`, `INVALID_CREDENTIALS`)

---

#### Frontend Integration — Invited Employee First Login

1. Call `POST /auth/login` with employee email + temporary password.
2. If `data.user.mustChangePassword === true`, route user to setup screen.
3. Call `POST /auth/complete-setup` with new password + PIN.
4. Replace stored access token with the returned setup token (`pinVerified: true`).
5. Continue normal app bootstrap and protected API calls.
6. On future sessions, login with permanent password then call `POST /auth/verify-pin` before protected employee routes.

---

#### `POST /auth/refresh`

**Request Body:**

```json
{ "refreshToken": "..." }
```

**Response `200`:** New access + refresh token pair.

---

#### `POST /auth/logout`

Revokes the refresh token stored in the database.

**Response `200`:** `{ "message": "Logged out successfully" }`

---

#### `POST /auth/forgot-password`

**Request Body:**

```json
{ "email": "john@example.com" }
```

Sends a reset email. Always responds `200` regardless of whether email exists (prevents enumeration).

---

#### `POST /auth/reset-password`

**Request Body:**

```json
{ "token": "...", "newPassword": "NewPass123!" }
```

**Response `200`:** `{ "message": "Password has been reset successfully" }`

---

### Clients Module

All routes scoped to the authenticated user's `businessId`.

#### `GET /clients`

| Query Param | Type   | Description                           |
| ----------- | ------ | ------------------------------------- |
| `search`    | string | Full-text search on name and email    |
| `page`      | number | Page number (default: 1)              |
| `limit`     | number | Items per page (default: 10, max: 50) |

**Caching:** Key `{businessId}:clients:list:{search}:{page}:{limit}` — TTL `CACHE_TTL.CLIENTS_LIST`

**Response `200`:** Array of `Client` documents + pagination meta.

---

#### `GET /clients/:id`

**Caching:** Key `{businessId}:clients:{id}` — TTL `CACHE_TTL.CLIENT_DETAIL`

**Response `200`:** Full `Client` document.

**Error responses:** `404`

---

#### `POST /clients`

**Request Body:**

```json
{
  "fullName": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+12025550101",
  "jobLocation": "Washington, DC",
  "defaultRate": 120.0
}
```

**Side effects:** Invalidates `clients:list:*` cache keys for this business. Creates an `ActivityLog` entry.

**Response `201`:** Created `Client` document.

---

#### `PATCH /clients/:id`

**Request Body:** Any subset of `Client` writable fields.

**Side effects:** Invalidates `clients:list:*` and `clients:{id}` cache. Creates `ActivityLog` entry.

**Response `200`:** Updated `Client` document.

---

#### `DELETE /clients/:id`

Soft-delete (`deletedAt = now`).

**Side effects:** Invalidates client cache. Creates `ActivityLog` entry.

**Response `200`:** `{ "message": "Client deleted successfully" }`

---

#### `GET /clients/:id/export`

Returns all data associated with a client (client info, jobs, invoices, payments, contracts, files) as a structured JSON export or triggers a PDF generation.

**Response `200`:** `{ "exportUrl": "https://res.cloudinary.com/..." }` (Cloudinary URL)

---

### Jobs Module

#### `GET /jobs`

| Query Param | Type   | Description                                        |
| ----------- | ------ | -------------------------------------------------- |
| `search`    | string | Text search on job title                           |
| `clientId`  | string | Filter by client                                   |
| `status`    | string | `pending \| in_progress \| completed \| cancelled` |
| `page`      | number | Default 1                                          |
| `limit`     | number | Default 8, max 50                                  |

**Caching:** `{businessId}:jobs:list:{params_hash}` — TTL `CACHE_TTL.JOBS_LIST`

---

#### `GET /jobs/:id`

**Caching:** `{businessId}:jobs:{id}` — TTL `CACHE_TTL.JOB_DETAIL`

Returns job with populated `clientId` (client name + email only).

---

#### `POST /jobs`

**Request Body:**

```json
{
  "clientId": "...",
  "title": "Drain Cleaning",
  "description": "Clear blocked kitchen drain",
  "scheduledDate": "2026-05-01T09:00:00Z",
  "location": "123 Main St, DC",
  "price": 350.0,
  "notes": "Customer mentioned slow drain for 2 weeks.",
  "contractRequired": false
}
```

**Response `201`:** Created `Job` document.

---

#### `PATCH /jobs/:id`

Updatable fields: `title`, `description`, `scheduledDate`, `status`, `location`, `price`, `notes`, `contractRequired`.

When `status` is set to `completed`, `completedAt` is auto-set to `now` and `client.totalSpent` is incremented by the job `price`.

---

#### `DELETE /jobs/:id`

Soft-delete.

---

#### `DELETE /jobs` (bulk)

**Request Body:**

```json
{ "ids": ["id1", "id2", "id3"] }
```

---

#### `POST /jobs/:id/contract/generate`

Generates a PDF contract using Puppeteer and uploads to Cloudinary. Creates or updates a `Contract` document linked to this job.

**Response `200`:**

```json
{
  "data": {
    "contractId": "...",
    "pdfUrl": "https://res.cloudinary.com/..."
  }
}
```

---

#### `POST /jobs/:id/contract/send`

Emails the contract PDF to the client.

**Request Body:**

```json
{ "clientEmail": "jane@example.com" }
```

---

### Invoices Module

#### `GET /invoices`

| Query Param | Type   | Description                   |
| ----------- | ------ | ----------------------------- |
| `search`    | string | Invoice number or client name |
| `clientId`  | string | Filter by client              |
| `status`    | string | `pending \| partial \| paid`  |
| `page`      | number | Default 1                     |
| `limit`     | number | Default 6, max 50             |

---

#### `GET /invoices/:id`

Returns invoice with `lineItems`, `totalAmount`, `amountPaid`, and populated client info.

---

#### `POST /invoices`

**Request Body:**

```json
{
  "clientId": "...",
  "invoiceNumber": "INV-0042",
  "invoiceDate": "2026-04-14",
  "dueDate": "2026-05-14",
  "lineItems": [
    { "description": "Labour (4 hrs)", "quantity": 4, "unitPrice": 85.0 },
    { "description": "Parts & materials", "quantity": 1, "unitPrice": 45.0 }
  ],
  "taxRate": 8.5,
  "jobId": "..."
}
```

`totalAmount` is computed server-side: `sum(qty * unitPrice) * (1 + taxRate/100)`.

---

#### `PATCH /invoices/:id`

Updatable: `status`, `dueDate`, `lineItems`, `taxRate`. When `status` changes to `paid`, a `Payment` record is auto-created if not already linked.

---

#### `DELETE /invoices/:id`

Soft-delete.

---

#### `GET /invoices/:id/pdf`

Returns Cloudinary URL for the invoice PDF. Generates on-demand if not cached.

**Response `200`:** `{ "data": { "pdfUrl": "..." } }`

---

#### `POST /invoices/:id/send`

Emails invoice PDF to the client.

---

### Payments Module

#### `GET /payments`

| Query Param   | Type     |
| ------------- | -------- |
| `search`      | string   |
| `status`      | string   |
| `paymentMode` | string   |
| `dateFrom`    | ISO date |
| `dateTo`      | ISO date |
| `page`        | number   |
| `limit`       | number   |

---

#### `POST /payments`

**Request Body:**

```json
{
  "invoiceId": "...",
  "clientId": "...",
  "paymentDate": "2026-04-14",
  "paymentMode": "bank_transfer",
  "amount": 380.0,
  "status": "completed",
  "notes": "Wire ref: TXN-88321"
}
```

**Side effects:** Updates linked `Invoice.amountPaid`. If `amountPaid >= totalAmount` the invoice status becomes `paid`; if partial, `partial`.

---

#### `PATCH /payments/:id`

---

#### `DELETE /payments/:id`

Soft-delete.

---

### Employees Module

#### `GET /employees`

| Query Param | Type   |
| ----------- | ------ |
| `search`    | string |
| `roleId`    | string |
| `page`      | number |
| `limit`     | number |

---

#### `GET /employees/:id`

Includes `weeklyHours` (aggregated from `ClockRecord` for the current week) and the most recent 3 clock entries.

---

#### `POST /employees`

**Request Body:**

```json
{
  "fullName": "Sarah Connor",
  "email": "sarah@business.com",
  "phone": "+12025550102",
  "roleId": "...",
  "weeklyHoursTarget": 40,
  "dateJoined": "2026-04-01"
}
```

**Side effects:**

- Creates `Employee` document.
- Creates a `User` account with a system-generated strong temporary password (hashed).
- Sends an invitation email with login credentials.

---

#### `PATCH /employees/:id`

---

#### `DELETE /employees/:id`

Soft-deletes both `Employee` and their linked `User` account.

---

#### `GET /employees/:id/clock-history`

| Query Param | Type     |
| ----------- | -------- |
| `startDate` | ISO date |
| `endDate`   | ISO date |
| `page`      | number   |
| `limit`     | number   |

---

#### `GET /employees/online`

Returns the current online employees for the business. This is the **HTTP half of the hybrid presence pattern** — used for the initial dashboard render so the "X Online" widget populates immediately on page load without waiting for a WebSocket event.

**Data source:** Redis hash `presence:{businessId}` via `HGETALL` — **no database query**.

**Required headers:** `Authorization`, `X-Business-Id`

**Required plan:** Starter (all plans)

**Response `200`:**

```json
{
  "success": true,
  "message": "Online employees retrieved successfully",
  "data": {
    "count": 8,
    "users": [
      {
        "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
        "employeeId": "64f1a2b3c4d5e6f7a8b9c0d2",
        "fullName": "Priya Patel",
        "initials": "PP",
        "avatarColor": "#6366f1"
      },
      {
        "userId": "64f1a2b3c4d5e6f7a8b9c0d3",
        "employeeId": "64f1a2b3c4d5e6f7a8b9c0d4",
        "fullName": "James Okafor",
        "initials": "JO",
        "avatarColor": "#f59e0b"
      }
    ]
  }
}
```

**Implementation notes:**

- `EmployeeService.getOnlineEmployees(businessId)` calls `redis.hgetall(`presence:${businessId}`)` and parses each value as `OnlineUser`.
- Returns `{ count: 0, users: [] }` when no one is online or Redis key is absent — never 404.
- `avatarColor` is deterministic: `AVATAR_COLORS[parseInt(userId.slice(-2), 16) % AVATAR_COLORS.length]` — consistent across HTTP and WebSocket responses.
- Result is **not cached** at the service layer (Redis hash itself is the live source of truth). HTTP response cache headers should be `Cache-Control: no-store`.

**Service implementation sketch:**

```typescript
// src/employees/employees.service.ts
async getOnlineEmployees(businessId: string): Promise<{ count: number; users: OnlineUser[] }> {
  const raw = await this.redis.hgetall(`presence:${businessId}`);
  if (!raw) return { count: 0, users: [] };
  const users = Object.values(raw).map(v => JSON.parse(v) as OnlineUser);
  return { count: users.length, users };
}
```

---

### Time Tracking Module

#### `POST /clock/in`

**Request Body:** `{ "employeeId": "..." }` _(owner can clock in on behalf; employees use their own `employeeId` from JWT)_

**Validation:** Employee must not already be clocked in. Checked via current `ClockRecord` with no `clockOutAt`.

**Response `201`:** `{ "data": { "clockRecordId": "...", "clockedInAt": "..." } }`

---

#### `POST /clock/out`

**Request Body:** `{ "employeeId": "..." }`

**Side effects:** Sets `clockOutAt`, computes `totalHours = (clockOutAt - clockInAt) / 3600000 - breakMinutes / 60`, stores on the record.

---

#### `POST /clock/break/start`

**Request Body:** `{ "employeeId": "..." }`

---

#### `POST /clock/break/end`

**Request Body:** `{ "employeeId": "...", "breakDurationMinutes": 30 }`

Adds to the `ClockRecord.breakMinutes` field.

---

#### `GET /clock/status/:employeeId`

**Caching:** `{businessId}:clock:{employeeId}` — TTL `CACHE_TTL.CLOCK_STATUS` (30 s)

**Response `200`:**

```json
{
  "data": {
    "status": "clocked_in",
    "clockedInAt": "2026-04-14T08:00:00Z",
    "breakStartedAt": null
  }
}
```

---

### Schedules Module

#### `GET /schedules`

| Query Param     | Type     | Description                                     |
| --------------- | -------- | ----------------------------------------------- |
| `weekStartDate` | ISO date | Monday of the week (auto-calculated if omitted) |
| `employeeId`    | string   | Filter to a specific employee                   |

**Caching:** `{businessId}:schedules:{weekStartDate}` — TTL `CACHE_TTL.SCHEDULES_WEEK`

Returns shifts for the requested week with employee names populated.

---

#### `POST /schedules`

**Request Body:**

```json
{
  "employeeId": "...",
  "shiftDate": "2026-04-14",
  "startTime": "09:00",
  "endTime": "17:00",
  "notes": "Morning crew"
}
```

**Validation:** No overlapping shift for the same employee on the same day.

---

#### `PATCH /schedules/:id`

---

#### `DELETE /schedules/:id`

---

### Tasks Module

#### `GET /tasks`

| Query Param  | Type               |
| ------------ | ------------------ |
| `assigneeId` | string             |
| `stage`      | string             |
| `status`     | `active \| closed` |
| `page`       | number             |
| `limit`      | number             |

**Caching:** `{businessId}:tasks:list:{params_hash}` — TTL `CACHE_TTL.TASKS_LIST`

---

#### `GET /tasks/:id`

Returns full task with `subtasks` and `comments` arrays.

---

#### `POST /tasks`

**Request Body:**

```json
{
  "title": "Fix bathroom leak",
  "description": "Address leak under the sink at Elm St property.",
  "assigneeId": "...",
  "priority": "high",
  "dueDate": "2026-04-20",
  "stage": "todo"
}
```

---

#### `PATCH /tasks/:id`

Updatable: `title`, `description`, `stage`, `status`, `priority`, `dueDate`, `assigneeId`.

---

#### `DELETE /tasks/:id`

Soft-delete.

---

#### `POST /tasks/:id/comments`

**Request Body:**

```json
{ "content": "Parts ordered, arriving Thursday." }
```

Appends to `task.comments` array. `authorId` is derived from JWT.

---

#### `POST /tasks/:id/subtasks`

**Request Body:**

```json
{ "title": "Order replacement valve" }
```

---

#### `PATCH /tasks/:id/subtasks/:subtaskId`

**Request Body:**

```json
{ "completed": true }
```

---

### Service Requests Module

#### `GET /requests`

| Query Param | Type   |
| ----------- | ------ |
| `status`    | string |
| `search`    | string |
| `page`      | number |
| `limit`     | number |

---

#### `GET /requests/:id`

---

#### `POST /requests`

This endpoint is **public** (no auth required) — it is called from the business's booking website. The `businessId` is resolved from a `businessSlug` in the URL or a `businessId` query param.

**Request Body:**

```json
{
  "clientName": "Mike Johnson",
  "clientEmail": "mike@gmail.com",
  "clientPhone": "+12025550103",
  "service": "Pipe Repair",
  "requestedDate": "2026-05-05",
  "message": "Burst pipe in kitchen"
}
```

Creates both a `Booking` record and a `ServiceRequest` document.

---

#### `PATCH /requests/:id`

**Request Body:**

```json
{
  "status": "accepted",
  "quotedPrice": 450.0
}
```

When `status` is `accepted`:

- Auto-creates a `Client` document from the request data (if one with that email doesn't already exist).
- Links the new `clientId` back to the `ServiceRequest`.

---

#### `DELETE /requests/:id`

Soft-delete.

---

### Messaging Module

> **Real-time delivery** is handled by the Socket.io gateway (`/chat` namespace — see [WebSocket Communication](#websocket-communication)).
> The REST endpoints below serve message **history**, **unread counts**, and **non-real-time operations** (announcements, team messages).
> Sending a message via `POST /messages` persists it and triggers a server-side `message_received` broadcast to any connected sockets in the room — so REST and WebSocket are kept in sync.

---

#### `GET /messages/conversations`

Returns all conversation threads for the business, ordered by most recent message. Used to build the inbox list.

**Response `200`:**

```json
{
  "data": [
    {
      "conversationId": "...",
      "client": {
        "id": "...",
        "fullName": "Jane Smith",
        "email": "jane@example.com"
      },
      "lastMessageContent": "Your invoice is ready.",
      "lastMessageAt": "2026-04-16T10:00:00Z",
      "lastMessageSender": "business",
      "businessUnreadCount": 0,
      "clientUnreadCount": 1
    }
  ]
}
```

---

#### `GET /messages/:clientId`

| Query Param | Type   |
| ----------- | ------ |
| `page`      | number |
| `limit`     | number |

Returns messages for a specific client thread, ordered newest-first with pagination. Also resets `businessUnreadCount` to 0 for the conversation when called by the business side.

---

#### `POST /messages`

Sends a message via REST. Persists to DB and broadcasts a `message_received` WebSocket event to any active sockets in `{businessId}:{clientId}` room.

**Request Body:**

```json
{
  "clientId": "...",
  "content": "Your invoice is ready for review."
}
```

`sender` and `senderName` are derived from JWT.

---

#### `PATCH /messages/read`

Marks messages as read up to a given message ID. Mirrors the WebSocket `mark_read` event for clients that are not connected via WebSocket.

**Request Body:**

```json
{
  "clientId": "...",
  "upToMessageId": "..."
}
```

---

#### `GET /team/messages`

| Query Param | Type   |
| ----------- | ------ |
| `page`      | number |
| `limit`     | number |

---

#### `POST /team/messages`

**Request Body:**

```json
{ "content": "Team meeting at 3pm today" }
```

---

#### `GET /team/announcements`

| Query Param | Type   |
| ----------- | ------ |
| `page`      | number |
| `limit`     | number |

---

#### `POST /team/announcements`

**Request Body:**

```json
{
  "title": "Q2 Performance Review",
  "description": "All employees must complete self-assessments by April 30."
}
```

---

### Roles & Permissions Module

#### `GET /roles`

**Caching:** `{businessId}:roles:list` — TTL `CACHE_TTL.ROLES_LIST`

Returns all roles for the business including the 3 seeded defaults.

---

#### `GET /roles/:id`

---

#### `POST /roles`

**Request Body:**

```json
{
  "name": "Dispatcher",
  "permissions": ["dashboard.view", "jobs.view", "jobs.edit", "clients.view"]
}
```

---

#### `PATCH /roles/:id`

Cannot modify `isDefault: true` roles' permissions — returns `403`.

---

#### `DELETE /roles/:id`

Cannot delete default roles — returns `403`.

---

#### `GET /permissions`

Returns the exhaustive list of all valid permission strings.

**Caching:** `permissions:all` — TTL `CACHE_TTL.PERMISSIONS_LIST`

---

### Activity Logs Module

#### `GET /activity-logs`

| Query Param | Type     | Description                         |
| ----------- | -------- | ----------------------------------- |
| `search`    | string   | Filter by actor name or action text |
| `category`  | string   | One of `LogCategory` enum values    |
| `dateFrom`  | ISO date |                                     |
| `dateTo`    | ISO date |                                     |
| `page`      | number   | Default 1                           |
| `limit`     | number   | Default 10, max 100                 |

**Caching:** Short TTL `CACHE_TTL.ACTIVITY_LOGS` (1 min).

Logs are automatically written by the `ActivityLogInterceptor` on all mutating operations (POST/PATCH/DELETE). Services can also emit logs directly for read events (e.g. login, export).

---

### Website Builder Module

#### `GET /website`

Returns the full website configuration for the authenticated business.

**Caching:** `{businessId}:website:config` — TTL `CACHE_TTL.WEBSITE_CONFIG`

---

#### `PATCH /website`

**Request Body:**

```json
{
  "siteName": "John's Plumbing",
  "heroTitle": "Your Trusted Plumber in DC",
  "heroSubtitle": "24/7 Emergency Service Available",
  "aboutUs": "Family-owned since 2010...",
  "contactInfo": "Call (202) 555-0100",
  "colors": { "primary": "#1e40af", "secondary": "#475569" },
  "font": "Poppins",
  "bookingFormFields": [
    {
      "fieldId": "full_name",
      "label": "Full Name",
      "type": "text",
      "placeholder": "Your full name",
      "required": true,
      "order": 0
    }
  ]
}
```

Invalidates `website:config` cache.

---

#### `POST /website/hero-image`

`multipart/form-data` — streams hero image to Cloudinary (non-blocking). Returns `{ "heroImageUrl": "..." }`.

---

#### `POST /website/publish`

Generates the subdomain `{businessSlug}.servixos.com`, marks website as published. Invalidates cache.

**Response `200`:**

```json
{
  "data": {
    "publishedUrl": "https://johns-plumbing.servixos.com",
    "published": true
  }
}
```

---

#### `POST /website/unpublish`

Sets `published: false`.

---

#### `POST /website/booking` (PUBLIC — no auth)

Receives a booking form submission from the public-facing website.

**Request Body:** `{ [fieldId]: value }` — free-form key-value pairs matching the configured `bookingFormFields`.

Validates that all `required` fields are present. Creates a `Booking` document and optionally a `ServiceRequest`.

---

### Analytics Module

#### `GET /analytics/traffic`

| Query Param | Type     | Description         |
| ----------- | -------- | ------------------- |
| `dateFrom`  | ISO date | Default: 7 days ago |
| `dateTo`    | ISO date | Default: today      |

**Caching:** `{businessId}:analytics:traffic:{dateFrom}:{dateTo}` — TTL `CACHE_TTL.ANALYTICS_TRAFFIC`

**Response `200`:**

```json
{
  "data": {
    "trafficData": [{ "date": "2026-04-08", "visitors": 42, "pageViews": 130 }],
    "topPages": [{ "page": "/", "views": 400, "percentage": 45.2 }],
    "stats": {
      "totalVisitors": 1240,
      "totalPageViews": 3800,
      "dailyAverage": 177,
      "conversionRate": 3.5
    }
  }
}
```

---

#### `GET /analytics/revenue`

| Query Param | Type   | Description               |
| ----------- | ------ | ------------------------- |
| `months`    | number | Last N months (default 7) |

**Caching:** `{businessId}:analytics:revenue:{months}` — TTL `CACHE_TTL.REVENUE_CHART`

Aggregates `Payment` documents grouped by month.

---

#### `GET /analytics/jobs`

Returns job status distribution for charts.

**Caching:** `{businessId}:analytics:jobs` — TTL `CACHE_TTL.JOB_STATUS_CHART`

---

#### `GET /analytics/dashboard`

Aggregated dashboard stats in a single request:

- Monthly revenue (current month payments sum)
- Active clients count (clients with at least one non-completed job)
- Outstanding invoices (count + total amount of `pending` + `partial` invoices)
- Review count (placeholder until reviews module is built)
- Recent activity feed (last 5 `ActivityLog` entries)
- Top 5 clients by `totalSpent`

**Caching:** `{businessId}:analytics:dashboard` — TTL `CACHE_TTL.DASHBOARD_STATS`

---

### AI Module

All AI endpoints forward context-aware data to the Anthropic Claude API.

#### `POST /ai/insights`

Generates up to 6 business insights based on the business's data (invoices, clients, jobs, payments).

**Request Body:**

```json
{ "dataScope": "last_30_days" }
```

**Caching:** `{businessId}:ai:insights` — TTL `CACHE_TTL.AI_INSIGHTS` (1 hour). Invalidated when user explicitly clicks "Refresh".

**Response `200`:**

```json
{
  "data": {
    "insights": [
      {
        "id": "ins_1",
        "title": "3 invoices are overdue",
        "description": "You have $1,200 outstanding past due date.",
        "category": "revenue",
        "priority": "high",
        "actionLabel": "View Invoices",
        "actionHref": "/invoices?status=pending"
      }
    ]
  }
}
```

---

#### `POST /ai/advisor`

Stateless chat endpoint. The caller passes the entire conversation history on each request (Claude API pattern).

**Request Body:**

```json
{
  "messages": [
    { "role": "user", "content": "Help me improve my pricing strategy" }
  ],
  "context": "pricing"
}
```

**Response `200`:**

```json
{
  "data": {
    "reply": "Based on your average job value of $380...",
    "suggestions": ["Introduce tiered pricing", "Bundle services"]
  }
}
```

---

#### `POST /ai/generate-description`

**Request Body:**

```json
{ "businessName": "John's Plumbing", "businessCategory": "plumbing" }
```

**Response `200`:** `{ "data": { "description": "..." } }`

---

### Files & Contracts Module

#### `GET /clients/:clientId/files`

Returns all non-deleted files for a client.

---

#### `POST /clients/:clientId/files`

`multipart/form-data`. Accepts PDF/DOC/DOCX/PNG/JPG up to 10 MB. Streams directly to Cloudinary (non-blocking), creates `ClientFile` document. Returns `400 FILE_TOO_LARGE` if file exceeds 10 MB.

---

#### `GET /files/:fileId`

Returns the Cloudinary secure URL for the file.

---

#### `DELETE /files/:fileId`

Soft-deletes the `ClientFile` document. Cloudinary resource is destroyed asynchronously via `cloudinary.uploader.destroy(publicId)`.

---

#### `GET /contracts`

| Query Param | Type   |
| ----------- | ------ |
| `clientId`  | string |
| `status`    | string |
| `page`      | number |
| `limit`     | number |

---

#### `GET /contracts/:id`

---

#### `POST /contracts`

**Request Body:**

```json
{
  "clientId": "...",
  "jobId": "...",
  "name": "Drain Cleaning Agreement",
  "amount": 350.0,
  "expiresAt": "2026-06-01"
}
```

---

#### `PATCH /contracts/:id`

**Request Body:**

```json
{ "status": "signed", "signedAt": "2026-04-14T15:30:00Z" }
```

---

#### `DELETE /contracts/:id`

Soft-delete.

---

#### `GET /contracts/:id/pdf`

Returns pre-signed PDF URL (generates on-demand via Puppeteer).

---

#### `POST /contracts/:id/send`

**Request Body:** `{ "clientEmail": "jane@example.com" }`

---

### Settings Module

#### `GET /settings/profile`

Returns the authenticated user's `Business` document.

**Caching:** `{businessId}:settings:profile` — TTL `CACHE_TTL.WEBSITE_CONFIG`

---

#### `PATCH /settings/profile`

**Request Body:**

```json
{
  "name": "John's Plumbing LLC",
  "category": "plumbing",
  "email": "info@johnsplumbing.com",
  "phone": "+12025550100",
  "address": "456 Commerce St, Washington DC 20001",
  "description": "Licensed and insured plumber..."
}
```

---

#### `PATCH /settings/password`

**Request Body:**

```json
{
  "currentPassword": "OldPass1!",
  "newPassword": "NewPass2@"
}
```

**Validation:** `currentPassword` must match stored `passwordHash`.

---

#### `GET /settings/notifications`

Returns `Business.notifications` preferences.

---

#### `PATCH /settings/notifications`

**Request Body:**

```json
{ "email": true, "newClient": false, "payment": true }
```

---

#### `PATCH /settings/subscription`

**Request Body:**

```json
{ "plan": "growth" }
```

In production this would integrate with Stripe. For now it updates `Business.subscriptionPlan`.

---

#### `DELETE /settings/account`

Permanently deletes the user account, business, and all associated data (hard-delete for GDPR compliance). Requires password confirmation.

**Request Body:**

```json
{ "password": "CurrentPass1!" }
```

---

## Guard & Middleware Strategy

The full request lifecycle enforces security in a strict, ordered chain. Every layer is applied globally via `app.module.ts` providers; individual routes opt out with decorators rather than opting in.

### Execution Order

```
Incoming Request
       │
       ▼  (1) DecryptionMiddleware        — decrypt body (AES-256-GCM, opt-in)
       │
       ▼  (2) JwtAuthGuard                — validate Bearer token, attach req.user
       │
       ▼  (3) TenantGuard                 — validate X-Business-Id header, cross-check with JWT
       │
       ▼  (4) SubscriptionGuard           — enforce plan-gated feature access
       │
       ▼  (5) PermissionsGuard            — enforce RBAC permissions
       │
       ▼  (6) ValidationPipe              — validate & transform DTOs
       │
       ▼  (7) Controller / Service / Repo
       │
       ▼  (8) ResponseTransformInterceptor — wrap in ApiResponse<T>
       │
       ▼  (9) EncryptionInterceptor       — encrypt response.data (AES-256-GCM, opt-in)
       │
Encrypted Response
```

---

### (1) Decryption Middleware

**File:** `src/common/middleware/decryption.middleware.ts`

Registered in `AppModule.configure()` for all routes (`*`). Acts as a **no-op** for the vast majority of routes — only activates when the matched route handler is decorated with `@Encrypt()`.

- Checks `ENCRYPT_KEY` metadata on the matched handler via `Reflector`.
- **Route has no `@Encrypt()`** → passes `req.body` through unchanged. Zero overhead.
- **Route has `@Encrypt()`** → reads `req.body` as `EncryptedEnvelope { iv, tag, payload }`, calls `decrypt(envelope, ENCRYPTION_SECRET)`, and replaces `req.body` with the parsed plaintext JSON.
- If the GCM auth tag fails (tampered or corrupted payload) → throws `400 Bad Request: "Invalid or tampered request payload"`.
- Requests with no body (GET, DELETE) on `@Encrypt()` routes pass through immediately.

**Environment variable dependency:** `ENCRYPTION_SECRET`

---

### (2) JWT Auth Guard

**File:** `src/common/guards/jwt-auth.guard.ts`

Applied globally via `APP_GUARD`.

- Extracts the `Authorization: Bearer <token>` header.
- Verifies signature and expiry of the access JWT.
- Decodes claims: `{ sub, businessId, userRole, pinVerified }`.
- Attaches the decoded payload to `req.user`.
- Routes decorated with `@Public()` skip JWT validation.

**JWT payload shape:**

```typescript
interface JwtPayload {
  sub: string; // userId
  businessId: string;
  userRole: UserRole;
  pinVerified: boolean;
  iat: number;
  exp: number;
}
```

---

### (3) PIN Verified Guard

**File:** `src/common/guards/pin-verified.guard.ts`

Applied globally via `APP_GUARD` after `JwtAuthGuard`.

- Skips all routes decorated with `@Public()`.
- Enforces PIN verification only for `employee` role users.
- If an employee token has `pinVerified !== true`, protected routes return `401` with `PIN_NOT_VERIFIED`.
- This is why invited employees must finish `/auth/complete-setup` (first login) or `/auth/verify-pin` (subsequent logins) before using protected employee endpoints.

---

### (4) Tenant Guard

**File:** `src/common/guards/tenant.guard.ts`

Applied globally via `APP_GUARD` — runs immediately after `JwtAuthGuard` so `req.user` is already populated. Skipped for `@Public()` routes.

**Purpose:** Enforces multi-tenancy at the transport layer. Even if a JWT is valid, a request cannot proceed unless it explicitly declares which business it is acting on, and that declaration is verified to match the token.

**Full execution logic:**

1. Read `X-Business-Id` header. Missing → `400 Bad Request: "Missing required X-Business-Id header"`.
2. Validate it is a well-formed MongoDB ObjectId. Invalid format → `400 Bad Request: "X-Business-Id must be a valid MongoDB ObjectId"`.
3. Compare `X-Business-Id` against `req.user.businessId` (from JWT).
   - Mismatch → `403 Forbidden: "X-Business-Id does not match the authenticated user's business"`.
   - This is the primary cross-tenant protection: even if someone obtains a valid JWT and a valid API key, they cannot access another business by changing this header.
4. Fetch the `Business` document from Redis cache key `tenant:{businessId}` (TTL `CACHE_TTL.TENANT_VALIDATION`). On miss, query MongoDB.
5. Business not found → `404 Not Found: "Business not found"`.
6. Business has `deletedAt` set → `404: "This business account no longer exists"`.
7. Business is inactive → `403: "This business account has been deactivated"`.
8. For **employee-role** users: additionally verify the `Employee` document's `businessId` matches. Mismatch → `403: "The authenticated employee does not belong to the specified business"`.
9. Attach the resolved `Business` document to `req.tenant` for downstream use by guards and services.

```typescript
// src/common/guards/tenant.guard.ts
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly businessRepository: BusinessRepository,
    private readonly employeeRepository: EmployeeRepository,
    private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const rawHeader = request.headers['x-business-id'] as string | undefined;

    // (1) Presence check
    if (!rawHeader) {
      throw new BadRequestException(TENANT_MESSAGES.ERROR.MISSING_HEADER);
    }

    // (2) Format check
    if (!Types.ObjectId.isValid(rawHeader)) {
      throw new BadRequestException(TENANT_MESSAGES.ERROR.INVALID_FORMAT);
    }

    // (3) JWT cross-check
    const jwtBusinessId = request.user?.businessId?.toString();
    if (rawHeader !== jwtBusinessId) {
      throw new ForbiddenException(TENANT_MESSAGES.ERROR.MISMATCH);
    }

    // (4) DB lookup with Redis cache
    const cacheKey = `tenant:${rawHeader}`;
    const cached = await this.redis.get(cacheKey);
    let business: Business;

    if (cached) {
      business = JSON.parse(cached);
    } else {
      business = await this.businessRepository.findById(rawHeader);
      if (business) {
        await this.redis.set(
          cacheKey,
          JSON.stringify(business),
          'EX',
          CACHE_TTL.TENANT_VALIDATION,
        );
      }
    }

    // (5 & 6) Existence and soft-delete check
    if (!business || business.deletedAt) {
      throw new NotFoundException(
        business?.deletedAt
          ? TENANT_MESSAGES.ERROR.DELETED
          : TENANT_MESSAGES.ERROR.NOT_FOUND,
      );
    }

    // (7) Active status check
    if (!business.isActive) {
      throw new ForbiddenException(TENANT_MESSAGES.ERROR.INACTIVE);
    }

    // (8) Employee–business relationship check
    if (request.user.userRole === UserRole.EMPLOYEE) {
      const employee = await this.employeeRepository.findByUserId(
        request.user.sub,
      );
      if (!employee || employee.businessId.toString() !== rawHeader) {
        throw new ForbiddenException(TENANT_MESSAGES.ERROR.EMPLOYEE_MISMATCH);
      }
    }

    // (9) Attach resolved tenant to request
    request.tenant = business;
    return true;
  }
}
```

**Cache key pattern:** `tenant:{businessId}`

**Cache invalidation:** On `DELETE /settings/account` (business deletion) and `PATCH /settings/profile` (business update), immediately `DEL tenant:{businessId}` from Redis.

**`Business` schema addition** — add `isActive` field:

```typescript
@prop({ default: true })
isActive: boolean;
```

---

### (5) Subscription Plan Guard

**File:** `src/common/guards/subscription.guard.ts`

Applied globally via `APP_GUARD` (after TenantGuard so `req.tenant` is available).

- Reads the `@RequirePlan(featureKey)` metadata from the route handler.
- No decorator → guard is a no-op; request proceeds.
- Fetches `Business.subscriptionPlan` from Redis cache key `{businessId}:subscription` (TTL `CACHE_TTL.SUBSCRIPTION_PLAN`), falls back to DB.
- Resolves `requiredPlan = FEATURE_PLAN_MAP[featureKey]`.
- Compares `PLAN_ORDER[currentPlan] >= PLAN_ORDER[requiredPlan]`.
- Insufficient plan → throws `403 ForbiddenException` with body:
  ```json
  {
    "success": false,
    "statusCode": 403,
    "message": "This feature requires the pro plan or higher. Please upgrade your subscription",
    "code": "SUBSCRIPTION_REQUIRED",
    "currentPlan": "starter",
    "requiredPlan": "pro",
    "upgradeUrl": "/settings?tab=subscription"
  }
  ```

**Cache invalidation:** On `PATCH /settings/subscription`, immediately `DEL {businessId}:subscription` from Redis.

**Limit enforcement** (hard quotas — distinct from the feature gate) lives in the **service layer**, not this guard, because it requires a DB count. The error shape mirrors the guard:

```json
{
  "success": false,
  "statusCode": 403,
  "message": "You have reached the 25-client limit for your current plan. Upgrade to add more clients",
  "code": "LIMIT_REACHED",
  "currentPlan": "starter",
  "upgradeUrl": "/settings?tab=subscription"
}
```

---

### (6) Permissions Guard

**File:** `src/common/guards/permissions.guard.ts`

Applied per-route via `@RequirePermissions('clients.create')`. Checks that `req.user.permissions` (decoded from JWT) includes every required permission string.

- Missing permission → `403 Forbidden: "You do not have permission to access this resource"`.
- No decorator → guard is a no-op.

---

### (7) ValidationPipe

Applied globally with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.

- Strips undeclared properties.
- Transforms plain JSON objects into DTO class instances.
- Returns `400 Bad Request` with detailed field-level error messages on validation failures.

---

### (8) Activity Log Interceptor

**File:** `src/common/interceptors/activity-log.interceptor.ts`

Applied globally, excluded for `GET` requests and routes tagged `@SkipActivityLog()`.

After a successful response, asynchronously writes an `ActivityLog` document with:

| Field        | Source                                                         |
| ------------ | -------------------------------------------------------------- |
| `businessId` | `req.user.businessId`                                          |
| `actorId`    | `req.user.sub`                                                 |
| `actorName`  | Fetched from User document (cached)                            |
| `actorRole`  | `req.user.userRole`                                            |
| `action`     | Controller metadata set via `@LogAction('...')`                |
| `category`   | Controller metadata set via `@LogCategory(LogCategory.CLIENT)` |
| `resourceId` | Extracted from route params (`:id`) or response                |
| `ipAddress`  | `req.ip` (or `X-Forwarded-For` behind proxy)                   |
| `userAgent`  | `req.headers['user-agent']`                                    |

---

### (9) Response Transform Interceptor

**File:** `src/common/interceptors/response-transform.interceptor.ts`

Runs before `EncryptionInterceptor`. Wraps every controller return value in the standard `ApiResponse<T>` shape. The controller only needs to return the raw `data` object and optionally a `message` string.

---

### (10) Encryption Interceptor

**File:** `src/common/interceptors/encryption.interceptor.ts`

Runs last in the interceptor chain, after response shape is finalised. Acts as a **no-op** for routes without `@Encrypt()`.

- Checks `ENCRYPT_KEY` metadata via `Reflector.getAllAndOverride` (supports both method-level and class-level decorator).
- **Route has no `@Encrypt()`** → returns the response unchanged. Zero overhead.
- **Route has `@Encrypt()`** → serialises `response.data` to JSON, calls `encrypt(json, ENCRYPTION_SECRET)`, replaces `response.data` with the `EncryptedEnvelope { iv, tag, payload }`.
- `response.meta`, `response.success`, `response.statusCode`, and `response.message` are **never** encrypted — they are structural metadata the client reads before attempting to decrypt `data`.

**Environment variable dependency:** `ENCRYPTION_SECRET`

---

### Rate Limiting

`@nestjs/throttler` backed by Redis storage:

| Scope                   | Limit          | Window     | Enforcement                  |
| ----------------------- | -------------- | ---------- | ---------------------------- |
| Global (all endpoints)  | 100 requests   | 1 minute   | Per IP                       |
| `POST /auth/verify-pin` | 3 attempts     | 5 minutes  | Per `userId` (Redis counter) |
| `POST /auth/login`      | 10 attempts    | 15 minutes | Per IP                       |
| `POST /ai/*`            | 30 requests    | 1 hour     | Per `businessId`             |
| `POST /website/booking` | 10 submissions | 1 hour     | Per IP                       |

Exceeding any limit returns `429 Too Many Requests` with a `Retry-After` header.

---

### Global Guard Registration Order (`app.module.ts`)

```typescript
providers: [
  { provide: APP_GUARD,       useClass: HmacGuard                 },
  { provide: APP_GUARD,       useClass: JwtAuthGuard              },
  { provide: APP_GUARD,       useClass: PinVerifiedGuard          },
  { provide: APP_GUARD,       useClass: TenantGuard               }, // X-Business-Id validation
  { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor       },
],
```

NestJS executes `APP_GUARD` providers in registration order and `APP_INTERCEPTOR` providers in reverse-registration order for the response path (first registered = outermost = last to run on response).

---

## Integration Test Suites

All tests use `@nestjs/testing` + `supertest`. A real MongoDB instance is spun up via `mongodb-memory-server` and a Redis mock via `ioredis-mock`. Each test suite seeds minimal fixture data and clears collections between tests.

---

### Test File Organisation

```
test/
├── setup.ts                        # Global beforeAll/afterAll, app bootstrap
├── helpers/
│   ├── encrypt-body.ts             # Encrypts a payload for test requests
│   ├── decrypt-response.ts         # Decrypts EncryptedEnvelope from response.data
│   └── time-travel.ts              # Overrides Date.now for TTL/expiry tests
├── fixtures/
│   ├── auth.fixture.ts
│   ├── business.fixture.ts
│   ├── clients.fixture.ts
│   ├── jobs.fixture.ts
│   ├── invoices.fixture.ts
│   └── ...
├── auth/
│   └── auth.e2e-spec.ts
├── tenant/
│   └── tenant.e2e-spec.ts
├── websocket/
│   ├── messaging.gateway.e2e-spec.ts
│   └── presence.gateway.e2e-spec.ts
├── encryption/
│   └── encryption.e2e-spec.ts
├── subscription/
│   └── subscription.e2e-spec.ts
├── clients/
│   └── clients.e2e-spec.ts
├── jobs/
│   └── jobs.e2e-spec.ts
├── invoices/
│   └── invoices.e2e-spec.ts
├── payments/
│   └── payments.e2e-spec.ts
├── employees/
│   └── employees.e2e-spec.ts
├── time-tracking/
│   └── time-tracking.e2e-spec.ts
├── schedules/
│   └── schedules.e2e-spec.ts
├── tasks/
│   └── tasks.e2e-spec.ts
├── requests/
│   └── requests.e2e-spec.ts
├── messaging/
│   └── messaging.e2e-spec.ts
├── roles/
│   └── roles.e2e-spec.ts
├── activity-logs/
│   └── activity-logs.e2e-spec.ts
├── website/
│   └── website.e2e-spec.ts
├── analytics/
│   └── analytics.e2e-spec.ts
├── files/
│   └── files.e2e-spec.ts
├── contracts/
│   └── contracts.e2e-spec.ts
└── settings/
    └── settings.e2e-spec.ts
```

**Test helper notes:**

- `encrypt-body.ts` — wraps the `encrypt()` util with the test `ENCRYPTION_SECRET` from `process.env.TEST_ENCRYPTION_SECRET`. All test `POST`/`PATCH` requests pipe through this before calling `supertest`.
- `decrypt-response.ts` — unwraps `response.body.data` (an `EncryptedEnvelope`) back to a plain object. All test assertions on response data go through this.
- `websocket/messaging.gateway.e2e-spec.ts` and `websocket/presence.gateway.e2e-spec.ts` both use the `socket.io-client` package. The NestJS test app is bootstrapped with `IoAdapter`. Each test creates a fresh client socket, connects with valid handshake credentials, and disconnects in `afterEach`. A `connectSocket(overrides?)` helper merges valid defaults with any field overrides to simplify negative-path tests. For presence tests, a `connectPresenceSocket(overrides?)` variant targets the `/presence` namespace.

---

### Auth — `auth.e2e-spec.ts`

```
POST /auth/register
  ✓ should register a new user with valid payload and return 201 with tokens
  ✓ should return 400 when required fields are missing
  ✓ should return 400 when password is too weak (< 8 chars, no uppercase)
  ✓ should return 400 when pin is not exactly 4 digits
  ✓ should return 400 when email format is invalid
  ✓ should return 409 when email is already registered
  ✓ should auto-create three default roles (Owner, Manager, Employee) on registration
  ✓ should auto-create a Website config document on registration

POST /auth/login
  ✓ should return 200 with tokens when credentials are valid
  ✓ should return 401 when password is wrong
  ✓ should return 401 when email does not exist
  ✓ should return 400 when body is missing required fields

POST /auth/verify-pin
  ✓ should return 200 and fresh accessToken when pin is correct
  ✓ should return 401 when pin is incorrect
  ✓ should return 401 PIN_LOCKED after 3 failed pin attempts within 5 minutes
  ✓ should clear pin_attempts counter after successful verification

POST /auth/complete-setup
  ✓ should allow invited employee to set password + pin on first login
  ✓ should return accessToken with pinVerified=true for protected routes

POST /auth/refresh
  ✓ should issue new token pair with valid refresh token
  ✓ should return 401 with expired refresh token
  ✓ should return 401 with revoked refresh token

POST /auth/logout
  ✓ should revoke the refresh token and return 200
  ✓ subsequent /auth/refresh with the revoked token should return 401

POST /auth/forgot-password
  ✓ should return 200 regardless of whether the email exists
  ✓ should send a reset email to a valid registered address

POST /auth/reset-password
  ✓ should reset the password with a valid reset token
  ✓ should return 401 with an expired or invalid reset token
  ✓ old password should no longer work after reset
```

---

### Clients — `clients.e2e-spec.ts`

```
GET /clients
  ✓ should return paginated list of clients for the authenticated business
  ✓ should not return clients from a different business
  ✓ should support full-text search by name
  ✓ should support full-text search by email
  ✓ should default to page 1, limit 10
  ✓ should respect page and limit query params
  ✓ should return empty array when no clients exist
  ✓ should return 401 without auth token

GET /clients/:id
  ✓ should return the client by id
  ✓ should return 404 for a client belonging to a different business
  ✓ should return 404 for a non-existent id
  ✓ should return 400 for an invalid ObjectId format

POST /clients
  ✓ should create a client with valid payload and return 201
  ✓ should return 400 for missing required fields (fullName, email)
  ✓ should return 400 for invalid email format
  ✓ should return 409 when email already exists within the same business
  ✓ should write an ActivityLog entry on creation
  ✓ should require clients.create permission

PATCH /clients/:id
  ✓ should update allowed fields and return 200
  ✓ should return 404 for unknown client
  ✓ should not allow updating businessId
  ✓ should write an ActivityLog entry on update

DELETE /clients/:id
  ✓ should soft-delete the client (set deletedAt)
  ✓ should return 404 for already-deleted client
  ✓ should write an ActivityLog entry on deletion
  ✓ should require clients.delete permission

GET /clients/:id/export
  ✓ should return an exportUrl for an existing client
  ✓ should return 404 for unknown client
```

---

### Jobs — `jobs.e2e-spec.ts`

```
GET /jobs
  ✓ should return paginated jobs list for the business
  ✓ should filter by status (pending, in_progress, completed, cancelled)
  ✓ should filter by clientId
  ✓ should search by title
  ✓ should not return jobs from other businesses

GET /jobs/:id
  ✓ should return job with client info populated

POST /jobs
  ✓ should create job with valid payload (201)
  ✓ should return 400 when clientId references a client in a different business
  ✓ should return 404 when clientId does not exist
  ✓ should return 400 for missing required fields
  ✓ should default status to 'pending'
  ✓ should require jobs.create permission

PATCH /jobs/:id
  ✓ should update job fields
  ✓ when status is set to 'completed' should set completedAt timestamp
  ✓ when status is set to 'completed' should increment client.totalSpent by job price
  ✓ should return 404 for unknown job

DELETE /jobs/:id
  ✓ should soft-delete job
  ✓ should require jobs.delete permission

DELETE /jobs (bulk)
  ✓ should soft-delete multiple jobs by ids array
  ✓ should ignore ids belonging to other businesses (no cross-business deletion)

POST /jobs/:id/contract/generate
  ✓ should return contractId and pdfUrl
  ✓ should create a Contract document linked to the job
  ✓ should return 404 for unknown job

POST /jobs/:id/contract/send
  ✓ should mark contract as sent and update sentAt
  ✓ should return 404 when job or linked contract does not exist
```

---

### Invoices — `invoices.e2e-spec.ts`

```
GET /invoices
  ✓ should return paginated invoices
  ✓ should filter by status
  ✓ should filter by clientId
  ✓ should search by invoice number

GET /invoices/:id
  ✓ should return invoice with lineItems and computed totalAmount

POST /invoices
  ✓ should create invoice and auto-calculate totalAmount (201)
  ✓ should include tax in totalAmount when taxRate is provided
  ✓ should return 400 when lineItems is empty
  ✓ should return 409 when invoiceNumber is duplicate within same business
  ✓ should return 404 when clientId does not exist

PATCH /invoices/:id
  ✓ should update status to 'paid'
  ✓ when status changes to 'paid', amountPaid should equal totalAmount
  ✓ should update dueDate
  ✓ should update lineItems and recompute totalAmount

DELETE /invoices/:id
  ✓ should soft-delete invoice

GET /invoices/:id/pdf
  ✓ should return pdfUrl

POST /invoices/:id/send
  ✓ should mark invoice as sent and return 200
```

---

### Payments — `payments.e2e-spec.ts`

```
GET /payments
  ✓ should return paginated payments
  ✓ should filter by paymentMode
  ✓ should filter by date range
  ✓ should search by businessName

POST /payments
  ✓ should create payment and return 201
  ✓ when invoiceId provided, should update invoice.amountPaid
  ✓ when amountPaid >= totalAmount, invoice status should become 'paid'
  ✓ when amountPaid < totalAmount, invoice status should become 'partial'
  ✓ should return 400 for amount <= 0

PATCH /payments/:id
  ✓ should update payment mode and amount

DELETE /payments/:id
  ✓ should soft-delete payment
```

---

### Employees — `employees.e2e-spec.ts`

```
GET /employees
  ✓ should return paginated employees with weeklyHours field
  ✓ should filter by roleId
  ✓ should search by name

GET /employees/:id
  ✓ should return employee with recent clock history (last 3)
  ✓ should include correct weeklyHours aggregation

POST /employees
  ✓ should create employee and linked User account (201)
  ✓ linked User should receive a generated temporary password
  ✓ should return 409 when email already exists within the business
  ✓ should require employees.create permission

PATCH /employees/:id
  ✓ should update employee fields

DELETE /employees/:id
  ✓ should soft-delete employee and linked User
  ✓ should require employees.delete permission

GET /employees/:id/clock-history
  ✓ should return clock records within date range
  ✓ should return all history when no date range provided
  ✓ should return empty array when employee has no clock records

GET /employees/online
  ✓ should return count and users array from Redis hash
  ✓ should return { count: 0, users: [] } when no one is online
  ✓ should return { count: 0, users: [] } when Redis key is absent
  ✓ should require valid Authorization header
  ✓ should require valid X-Business-Id header
  ✓ should not issue a MongoDB query (only Redis HGETALL)
  ✓ should return consistent avatarColor matching /presence WS responses
```

---

### Time Tracking — `time-tracking.e2e-spec.ts`

```
POST /clock/in
  ✓ should create a ClockRecord and return clockRecordId (201)
  ✓ should return 409 when employee is already clocked in
  ✓ should invalidate the clock status cache

POST /clock/out
  ✓ should set clockOutAt and compute totalHours
  ✓ totalHours should subtract breakMinutes correctly
  ✓ should return 409 when employee is not clocked in

POST /clock/break/start
  ✓ should set breakStartedAt and status to 'on_break'
  ✓ should return 409 when employee is already on break
  ✓ should return 409 when employee is not clocked in

POST /clock/break/end
  ✓ should increment breakMinutes on active ClockRecord
  ✓ should return status 'clocked_in' after break ends
  ✓ should return 409 when employee is not on break

GET /clock/status/:employeeId
  ✓ should return current clock status
  ✓ should return 'clocked_out' when no active record exists
  ✓ response should be served from cache on second identical request
```

---

### Schedules — `schedules.e2e-spec.ts`

```
GET /schedules
  ✓ should return all shifts for the requested week
  ✓ should filter by employeeId
  ✓ should default to current week when weekStartDate not provided
  ✓ should not return shifts from other businesses

POST /schedules
  ✓ should create a shift and return 201
  ✓ should return 409 when shift overlaps existing shift for same employee on same day
  ✓ should return 404 when employeeId does not belong to this business

PATCH /schedules/:id
  ✓ should update startTime and endTime

DELETE /schedules/:id
  ✓ should delete shift
```

---

### Tasks — `tasks.e2e-spec.ts`

```
GET /tasks
  ✓ should return paginated tasks
  ✓ should filter by stage (todo, in_progress, completed)
  ✓ should filter by status (active, closed)
  ✓ should filter by assigneeId

GET /tasks/:id
  ✓ should return task with subtasks and comments

POST /tasks
  ✓ should create task with all fields (201)
  ✓ should return 404 when assigneeId does not belong to this business
  ✓ should default stage to 'todo' and priority to 'medium'

PATCH /tasks/:id
  ✓ should update stage
  ✓ should update status to 'closed'
  ✓ should reassign task to a different employee

DELETE /tasks/:id
  ✓ should soft-delete task

POST /tasks/:id/comments
  ✓ should append comment to task.comments
  ✓ comment should contain authorId from JWT

POST /tasks/:id/subtasks
  ✓ should append subtask to task.subtasks with completed: false

PATCH /tasks/:id/subtasks/:subtaskId
  ✓ should toggle subtask completed to true
  ✓ should toggle subtask completed back to false
  ✓ should return 404 for unknown subtaskId
```

---

### Service Requests — `requests.e2e-spec.ts`

```
GET /requests
  ✓ should return paginated requests
  ✓ should filter by status

GET /requests/:id
  ✓ should return request details
  ✓ should not return request from another business

POST /requests (public endpoint)
  ✓ should create a ServiceRequest and Booking document (201) without auth
  ✓ should return 400 for missing required fields
  ✓ should resolve businessId from businessSlug parameter

PATCH /requests/:id
  ✓ when accepted: should create Client document if email not already a client
  ✓ when accepted: should link clientId to the ServiceRequest
  ✓ when accepted: should set actionedAt timestamp
  ✓ when rejected: should set status to 'rejected'
  ✓ should return 409 when request is already actioned

DELETE /requests/:id
  ✓ should soft-delete request
```

---

### WebSocket Messaging — `messaging.gateway.e2e-spec.ts`

```
Connection & authentication (WsAuthGuard)
  ✓ should connect successfully with valid token and businessId in handshake auth
  ✓ should emit 'connection_error' and disconnect when token is missing
  ✓ should emit 'connection_error' and disconnect when token is expired
  ✓ should emit 'connection_error' and disconnect when token is malformed
  ✓ should emit 'connection_error' and disconnect when businessId is missing
  ✓ should emit 'connection_error' and disconnect when businessId does not match JWT claim
  ✓ should emit 'connection_error' and disconnect when business is deactivated
  ✓ on successful connect, should receive a 'connected' event with socketId and userId

join_room event
  ✓ should join room '{businessId}:{clientId}' when clientId belongs to this business
  ✓ should receive 'room_joined' event with last 20 messages as history on join
  ✓ should return 'error' event when clientId is not a valid ObjectId
  ✓ should return 'error' event when client does not belong to the authenticated business
  ✓ both business socket and client socket should receive messages after both join the same room

send_message event
  ✓ should broadcast 'message_received' to all sockets in the room including sender
  ✓ should persist a Message document to MongoDB with status SENT
  ✓ should upsert the Conversation document (lastMessageContent, lastMessageAt, unreadCount++)
  ✓ should acknowledge with { success: true, messageId } via callback
  ✓ should return 'error' event when content is empty string
  ✓ should return 'error' event when content exceeds 4000 characters
  ✓ should return 'error' event when socket has not joined a room yet
  ✓ should return 'error' event when clientId is not provided in payload
  ✓ message_received payload should include messageId, content, sender, senderName, createdAt
  ✓ a second socket in the same room (client side) should also receive 'message_received'

message_delivered acknowledgement
  ✓ when recipient socket receives 'message_received', it should auto-emit 'message_delivered'
  ✓ 'message_delivered' should update Message.status to DELIVERED and set deliveredAt
  ✓ sender should receive 'message_delivered' event with messageId and deliveredAt

mark_read event
  ✓ should update all messages up to upToMessageId to status READ with readAt timestamp
  ✓ should update Conversation.businessUnreadCount to 0 when business side reads
  ✓ should update Conversation.clientUnreadCount to 0 when client side reads
  ✓ should broadcast 'message_read' to all sockets in the room
  ✓ should only mark messages sent by the other party (not the caller's own messages)
  ✓ should return 'error' event when upToMessageId is not a valid ObjectId

typing_start / typing_stop events
  ✓ 'typing_start' should broadcast 'user_typing' to other sockets in the room (not back to sender)
  ✓ 'typing_stop' should broadcast 'user_stopped_typing' to other sockets in the room
  ✓ 'typing_start' without joining a room first should emit 'error' event

Online presence
  ✓ on connect, userId should be added to Redis presence set for the business
  ✓ on disconnect, userId should be removed from Redis presence set
  ✓ connected participants in the business should receive 'user_online' on a new connection
  ✓ connected participants should receive 'user_offline' when a socket disconnects
  ✓ presence TTL should be rolling — refreshed on each heartbeat ping

Rate limiting (per socket)
  ✓ sending more than 30 messages per minute from one socket should return 'error' RATE_LIMITED
  ✓ rate limit should reset after the window expires

Offline message delivery (fallback)
  ✓ message sent while recipient is offline should be persisted with status SENT
  ✓ when recipient later connects and joins the room, 'room_joined' history should include unread messages
  ✓ unread count on Conversation should reflect messages received while offline

REST + WebSocket sync
  ✓ POST /messages (REST) should trigger 'message_received' on active sockets in the room
  ✓ PATCH /messages/read (REST) should update DB — subsequent WS connection should show 0 unread
```

---

### Presence Gateway — `websocket/presence.gateway.e2e-spec.ts`

```
Connection & authentication (WsAuthGuard — /presence namespace)
  ✓ should connect to /presence namespace with valid token and businessId
  ✓ should emit 'connection_error' and disconnect when token is missing
  ✓ should emit 'connection_error' and disconnect when token is expired
  ✓ should emit 'connection_error' and disconnect when businessId is missing
  ✓ should emit 'connection_error' and disconnect when businessId mismatches JWT claim
  ✓ should emit 'connection_error' and disconnect when business is deactivated

online_list — initial state on connect
  ✓ on successful connect, should immediately receive 'online_list' with count and users array
  ✓ 'online_list' should include the newly connected user themselves
  ✓ 'online_list' should include all previously connected users for the same business
  ✓ 'online_list' users should each have userId, fullName, initials, and avatarColor fields
  ✓ avatarColor should match the deterministic color for the userId (same across reconnects)
  ✓ 'online_list' count should equal the length of the users array

user_online — presence broadcast
  ✓ other sockets in the same business room should receive 'user_online' when a new socket connects
  ✓ 'user_online' payload should include userId, fullName, initials, and avatarColor
  ✓ the newly connected socket should NOT receive its own 'user_online' broadcast (not emitted to self)
  ✓ sockets from different businesses should NOT receive 'user_online' for unrelated businesses

user_offline — disconnect broadcast
  ✓ remaining sockets should receive 'user_offline' when a connected socket disconnects
  ✓ 'user_offline' payload should include only userId
  ✓ sockets from different businesses should NOT receive 'user_offline' for unrelated businesses
  ✓ disconnecting the only connected socket should leave the business Redis hash empty

Redis state
  ✓ on connect, userId should be added to Redis hash `presence:{businessId}` with OnlineUser JSON value
  ✓ stored Redis value should include fullName, initials, and avatarColor
  ✓ on disconnect, userId key should be removed from Redis hash `presence:{businessId}`
  ✓ TTL on `presence:{businessId}` hash should be set to WS_PRESENCE (1800s) on connect
  ✓ TTL should be refreshed (rolling) on each new connection to the same business
  ✓ when the last user disconnects, Redis hash should no longer exist (HDEL cleans it up)

Hybrid sync — HTTP + WebSocket consistency
  ✓ GET /employees/online should return the same users as the WebSocket 'online_list' for the same business
  ✓ avatarColor from GET /employees/online should match avatarColor from 'online_list' for the same userId
  ✓ after a socket disconnects, GET /employees/online count should decrement by 1
  ✓ after a new socket connects, GET /employees/online count should increment by 1
  ✓ concurrent connections from the same userId (two browser tabs) should appear once in online_list
  ✓ second tab disconnect should NOT emit user_offline if the userId still has another active socket

Multi-tenant isolation
  ✓ businessA sockets should not receive presence events from businessB
  ✓ GET /employees/online for businessA should not include employees from businessB
  ✓ Redis hashes for different businesses are namespaced and do not bleed across tenants

Error handling
  ✓ Redis unavailable: connect should still succeed but online_list returns empty with graceful error log
  ✓ reconnect after network drop should re-add userId to Redis and re-broadcast user_online
```

---

### Messaging REST — `messaging.e2e-spec.ts`

```
GET /messages/conversations
  ✓ should return all conversation threads ordered by most recent message
  ✓ should not return conversations from another business
  ✓ should include correct businessUnreadCount and clientUnreadCount per thread
  ✓ should return empty array when no conversations exist

GET /messages/:clientId
  ✓ should return paginated messages ordered newest-first
  ✓ should reset businessUnreadCount to 0 on the conversation when business reads
  ✓ should return 404 when clientId does not belong to this business
  ✓ should return empty array when no messages exist

POST /messages
  ✓ should create message, persist to DB, and return 201
  ✓ sender fields should be derived from JWT, not request body
  ✓ should upsert the Conversation document on creation
  ✓ should return 404 when clientId is invalid

PATCH /messages/read
  ✓ should mark all messages up to upToMessageId as read
  ✓ should return 400 for invalid upToMessageId format
  ✓ should return 404 when clientId does not belong to this business

GET /team/messages
  ✓ should return paginated team messages

POST /team/messages
  ✓ should create team message

GET /team/announcements
  ✓ should return paginated announcements

POST /team/announcements
  ✓ should create announcement with authorId from JWT
```

---

### Roles — `roles.e2e-spec.ts`

```
GET /roles
  ✓ should return all roles including 3 seeded defaults
  ✓ response should be served from cache on second request

POST /roles
  ✓ should create role with valid permissions (201)
  ✓ should return 400 when permissions contain invalid strings
  ✓ should return 409 when role name already exists

PATCH /roles/:id
  ✓ should update custom role name and permissions
  ✓ should return 403 when trying to modify a default role

DELETE /roles/:id
  ✓ should delete custom role
  ✓ should return 403 when trying to delete a default role

GET /permissions
  ✓ should return complete list of 34 permission strings
```

---

### Activity Logs — `activity-logs.e2e-spec.ts`

```
GET /activity-logs
  ✓ should return paginated logs for the business
  ✓ should not include logs from other businesses
  ✓ should filter by category
  ✓ should filter by date range
  ✓ should search by actor name
  ✓ should search by action description

Interceptor behaviour (verified via side effects)
  ✓ POST /clients should auto-create an ActivityLog entry with category 'client'
  ✓ DELETE /jobs/:id should auto-create an ActivityLog entry with category 'job'
  ✓ PATCH /invoices/:id should auto-create an ActivityLog entry with category 'invoice'
  ✓ POST /auth/login should create an ActivityLog entry with category 'auth'
```

---

### Website — `website.e2e-spec.ts`

```
GET /website
  ✓ should return website config for authenticated business
  ✓ should return 404 before website is initialised (edge case)

PATCH /website
  ✓ should update hero fields and return updated config
  ✓ should update colors
  ✓ should update bookingFormFields preserving order
  ✓ should return 400 for invalid BookingFieldType

POST /website/publish
  ✓ should set published: true and return publishedUrl
  ✓ should generate a subdomain from businessName

POST /website/unpublish
  ✓ should set published: false

POST /website/booking (public)
  ✓ should accept booking with all required fields satisfied
  ✓ should return 400 when a required field is missing
  ✓ should create a Booking document in the DB
  ✓ should return 400 when business is not found by slug
  ✓ should rate-limit excessive booking submissions from the same IP
```

---

### Analytics — `analytics.e2e-spec.ts`

```
GET /analytics/traffic
  ✓ should return traffic data within the specified date range
  ✓ should default to last 7 days when no date range provided
  ✓ should include topPages and aggregate stats

GET /analytics/revenue
  ✓ should return monthly revenue aggregated from payments
  ✓ should default to last 7 months

GET /analytics/jobs
  ✓ should return job status distribution counts

GET /analytics/dashboard
  ✓ should return all dashboard stats in a single response
  ✓ should only count payments from current month for monthlyRevenue
  ✓ outstanding invoices should include both pending and partial
  ✓ response should be served from cache on second request
  ✓ cache should invalidate when a new payment is created
```

---

### Files — `files.e2e-spec.ts`

```
GET /clients/:clientId/files
  ✓ should return all files for the client
  ✓ should return 404 when client does not belong to business

POST /clients/:clientId/files
  ✓ should upload a PDF file and return ClientFile document (201)
  ✓ should return 400 for unsupported file types (e.g. .exe)
  ✓ should return 400 FILE_TOO_LARGE when file exceeds 10 MB
  ✓ uploaded file should be accessible via the returned Cloudinary url

GET /files/:fileId
  ✓ should return a pre-signed download URL
  ✓ should return 404 for file belonging to another business

DELETE /files/:fileId
  ✓ should soft-delete file document
  ✓ should return 404 for already-deleted file
```

---

### Contracts — `contracts.e2e-spec.ts`

```
GET /contracts
  ✓ should return paginated contracts
  ✓ should filter by clientId
  ✓ should filter by status

GET /contracts/:id
  ✓ should return contract with client and job info

POST /contracts
  ✓ should create contract (201)
  ✓ should return 404 when clientId does not belong to business

PATCH /contracts/:id
  ✓ should update status to 'signed' and set signedAt

DELETE /contracts/:id
  ✓ should soft-delete contract

GET /contracts/:id/pdf
  ✓ should return pdfUrl

POST /contracts/:id/send
  ✓ should mark contract as sent and update sentAt
```

---

### Settings — `settings.e2e-spec.ts`

```
GET /settings/profile
  ✓ should return business profile for the authenticated owner
  ✓ should require settings.view permission

PATCH /settings/profile
  ✓ should update business fields and return updated profile
  ✓ should require settings.edit permission

PATCH /settings/password
  ✓ should update password when currentPassword matches
  ✓ should return 401 when currentPassword is wrong
  ✓ new password must meet complexity requirements

GET /settings/notifications
  ✓ should return notification preferences

PATCH /settings/notifications
  ✓ should update individual notification toggles

PATCH /settings/subscription
  ✓ should update subscriptionPlan on the Business document

DELETE /settings/account
  ✓ should delete user, business, and all associated documents when password is confirmed
  ✓ should return 401 when password confirmation fails
  ✓ deleted user should not be able to log in after account deletion
```

---

### Tenant Guard — `tenant.e2e-spec.ts`

```
X-Business-Id header presence and format
  ✓ every protected endpoint returns 400 when X-Business-Id header is absent
  ✓ every protected endpoint returns 400 when X-Business-Id is not a valid ObjectId (e.g. "abc")
  ✓ every protected endpoint returns 400 when X-Business-Id is an empty string

JWT cross-check
  ✓ returns 403 when X-Business-Id does not match the businessId in the JWT
  ✓ returns 403 even when the provided X-Business-Id is a real, active business belonging to another user
  ✓ owner of Business A cannot access Business B's data by changing X-Business-Id to Business B's id
  ✓ valid X-Business-Id that matches JWT businessId should proceed to the next guard

Business document validation
  ✓ returns 404 when the business matching X-Business-Id does not exist in the database
  ✓ returns 404 when the business has a deletedAt timestamp (soft-deleted)
  ✓ returns 403 when the business has isActive: false
  ✓ active, existing business that matches JWT should allow the request to proceed

Employee–business relationship
  ✓ employee user with X-Business-Id matching their own business should succeed
  ✓ employee user whose Employee document businessId differs from X-Business-Id returns 403
  ✓ owner-role user skips the Employee document check

Redis cache behaviour
  ✓ second identical request within TTL window should be served from cache (no DB hit for business lookup)
  ✓ deactivating a business (isActive: false) and then deleting the cache entry should cause 403 on next request
  ✓ DEL tenant:{businessId} is called when the business profile is updated
  ✓ DEL tenant:{businessId} is called when the account is deleted

req.tenant availability
  ✓ after TenantGuard passes, req.tenant should contain the resolved Business document
  ✓ SubscriptionGuard downstream should read subscriptionPlan from req.tenant (no extra DB lookup)

@Public() routes
  ✓ POST /auth/login (@Public()) does not require X-Business-Id header
  ✓ POST /auth/register (@Public()) does not require X-Business-Id header
  ✓ POST /website/booking (public) does not require X-Business-Id header
```

---

### Request & Response Encryption — `encryption.e2e-spec.ts`

```
Opt-in behaviour — @Encrypt() decorator
  ✓ POST /auth/login (@Encrypt()) with a correctly encrypted body should return 200 with encrypted data
  ✓ POST /auth/login (@Encrypt()) with a plaintext body should return 400 Invalid or tampered request payload
  ✓ POST /clients (no @Encrypt()) with a plaintext body should return 201 — no decryption attempted
  ✓ POST /clients (no @Encrypt()) with an EncryptedEnvelope body should be treated as literal JSON (not decrypted)
  ✓ GET /clients (no @Encrypt()) should return plain data field — not an EncryptedEnvelope
  ✓ GET /invoices/:id (@Encrypt()) should return data as an EncryptedEnvelope { iv, tag, payload }

DecryptionMiddleware — @Encrypt() routes
  ✓ encrypted body with correct iv, tag, payload should be decrypted and req.body replaced with plaintext JSON
  ✓ encrypted body with a corrupted auth tag should return 400
  ✓ encrypted body with a tampered payload (iv unchanged, ciphertext modified) should return 400
  ✓ encrypted body where the decrypted content is not valid JSON should return 400
  ✓ GET /invoices/:id (@Encrypt(), no body) should not throw — middleware skips bodyless requests
  ✓ DELETE /clients/:id (no @Encrypt(), no body) should pass through with no action from middleware

EncryptionInterceptor — @Encrypt() routes
  ✓ @Encrypt() route response.data should be an EncryptedEnvelope { iv, tag, payload }
  ✓ decrypting EncryptedEnvelope.payload should yield JSON equal to the original plain response.data
  ✓ response.meta (pagination) should remain plaintext — not encrypted
  ✓ response.success, response.statusCode, response.message should remain plaintext
  ✓ two consecutive calls to the same @Encrypt() route should produce different iv values each time
  ✓ error responses (4xx/5xx) on @Encrypt() routes should NOT encrypt — plain ApiResponse shape
  ✓ non-@Encrypt() route response should have data as a plain object — not an EncryptedEnvelope

Class-level @Encrypt() decorator
  ✓ applying @Encrypt() on AiController class should encrypt all routes in that controller
  ✓ a method-level @Encrypt() should override or confirm class-level — encryption still applies

Key management
  ✓ rotating ENCRYPTION_SECRET should cause all in-flight @Encrypt() payloads to fail decryption (400)
  ✓ non-@Encrypt() routes are unaffected when ENCRYPTION_SECRET is rotated
  ✓ ENCRYPTION_SECRET and ENCRYPTION_HMAC_SECRET must be different values (validated at app bootstrap)
  ✓ ENCRYPTION_SECRET shorter than 64 hex chars should throw ConfigurationError on startup
```

---

### Subscription Plan Guard — `subscription.e2e-spec.ts`

```
Feature gate enforcement (@RequirePlan)

  AI Insights (requires pro)
  ✓ starter plan business calling POST /ai/insights should return 403 SUBSCRIPTION_REQUIRED
  ✓ growth plan business calling POST /ai/insights should return 403 SUBSCRIPTION_REQUIRED
  ✓ pro plan business calling POST /ai/insights should return 200
  ✓ 403 response should include currentPlan, requiredPlan, and upgradeUrl fields

  AI Advisor (requires pro)
  ✓ starter plan calling POST /ai/advisor should return 403
  ✓ pro plan calling POST /ai/advisor should return 200

  Analytics — revenue & traffic (requires growth)
  ✓ starter plan calling GET /analytics/revenue should return 403
  ✓ growth plan calling GET /analytics/revenue should return 200
  ✓ pro plan calling GET /analytics/revenue should return 200

  Employee management (requires growth)
  ✓ starter plan calling POST /employees should return 403
  ✓ growth plan calling POST /employees should return 201

  Custom roles (requires pro)
  ✓ growth plan calling POST /roles should return 403
  ✓ pro plan calling POST /roles should return 201

  File uploads (requires growth)
  ✓ starter plan calling POST /clients/:id/files should return 403
  ✓ growth plan calling POST /clients/:id/files should return 201

  Activity logs (requires growth)
  ✓ starter plan calling GET /activity-logs should return 403
  ✓ growth plan calling GET /activity-logs should return 200

  Starter-accessible routes (no plan gate)
  ✓ starter plan can POST /clients (no gate)
  ✓ starter plan can POST /jobs (no gate)
  ✓ starter plan can POST /invoices (no gate)
  ✓ starter plan can PATCH /requests/:id (no gate)
  ✓ starter plan can access GET /analytics/dashboard (no gate)

Subscription plan cache
  ✓ two consecutive plan-gated requests should hit Redis (plan not re-fetched from DB)
  ✓ upgrading plan via PATCH /settings/subscription should invalidate the subscription cache
  ✓ first request after plan upgrade should see the new plan immediately (no stale cache)

Hard limit enforcement (service layer)

  Client limit
  ✓ starter plan: 26th client creation should return 403 CLIENT_LIMIT_REACHED (limit: 25)
  ✓ growth plan: 251st client creation should return 403 CLIENT_LIMIT_REACHED (limit: 250)
  ✓ pro plan: no client limit — 1000th client should return 201

  Job limit (per calendar month)
  ✓ starter plan: 21st job in a calendar month should return 403 JOB_LIMIT_REACHED (limit: 20)
  ✓ job counter should reset at the start of a new calendar month
  ✓ growth plan: 201st job in a month should return 403

  Invoice limit (per calendar month)
  ✓ starter plan: 21st invoice in a month should return 403 INVOICE_LIMIT_REACHED
  ✓ pro plan: no invoice limit

  Employee limit
  ✓ growth plan: 11th employee creation should return 403 EMPLOYEE_LIMIT_REACHED (limit: 10)
  ✓ pro plan: no employee limit

  403 LIMIT_REACHED response body
  ✓ should contain code: 'LIMIT_REACHED'
  ✓ should contain currentPlan
  ✓ should contain upgradeUrl: '/settings?tab=subscription'

Plan downgrade guard
  ✓ PATCH /settings/subscription to downgrade when current usage exceeds target plan limits
    should return 409 DOWNGRADE_CONFLICT with details of which limits are exceeded
  ✓ PATCH /settings/subscription to downgrade when usage is within target plan limits
    should succeed and update Business.subscriptionPlan
```

---

### Cross-Cutting / Security Test Cases

These cases must be verified across multiple modules:

```
Multi-tenancy isolation
  ✓ every protected request without X-Business-Id header returns 400
  ✓ X-Business-Id that does not match JWT businessId returns 403 on every protected endpoint
  ✓ User A cannot read User B's clients even with a valid JWT by swapping X-Business-Id
  ✓ User A cannot update User B's jobs even with a valid JWT by swapping X-Business-Id
  ✓ User A cannot delete User B's invoices even with a valid JWT by swapping X-Business-Id
  ✓ all DB queries are scoped to the businessId from the validated X-Business-Id, not from request body or query string
  ✓ a deactivated business returns 403 on all protected endpoints regardless of JWT validity

Authentication (JWT)
  ✓ Every protected endpoint returns 401 without a Bearer token
  ✓ Every protected endpoint returns 401 with an expired access token
  ✓ Every protected endpoint returns 401 with a malformed token
Payload encryption integrity (@Encrypt() routes only)
  ✓ Any 1-byte flip in EncryptedEnvelope.payload on an @Encrypt() route returns 400 (GCM tag fails)
  ✓ Any 1-byte flip in EncryptedEnvelope.tag on an @Encrypt() route returns 400
  ✓ Swapping iv from one request into another @Encrypt() request returns 400
  ✓ Sending a plaintext body to an @Encrypt() route returns 400
  ✓ Sending an EncryptedEnvelope body to a non-@Encrypt() route does NOT return 400 — treated as plain JSON

RBAC
  ✓ Employee with no clients.create permission cannot POST /clients (403)
  ✓ Employee with clients.view but not clients.delete cannot DELETE /clients/:id (403)
  ✓ Owner (all permissions) can access all endpoints

Subscription guard + RBAC interaction
  ✓ An employee on a growth plan CAN access GET /analytics/revenue if they have reports.view
  ✓ An employee on a starter plan CANNOT access GET /analytics/revenue regardless of permissions
  ✓ Both SUBSCRIPTION_REQUIRED and PERMISSION_DENIED must be correct; subscription is checked first

Soft-delete consistency
  ✓ Soft-deleted clients do not appear in GET /clients
  ✓ Soft-deleted clients return 404 on GET /clients/:id
  ✓ Soft-deleted employees do not appear in employee lists

Input validation
  ✓ Invalid ObjectId format returns 400 with descriptive error
  ✓ Negative amounts return 400
  ✓ Future dates are accepted; past dates validated contextually
  ✓ XSS payloads in text fields are sanitized (stored as plain text, not rendered)
  ✓ SQL/NoSQL injection strings in text fields are stored safely (Mongoose parameterises all queries)

Rate limiting
  ✓ Exceeding 100 req/min from same IP returns 429 with Retry-After header
  ✓ POST /auth/login throttles at 10 attempts / 15 min per IP
  ✓ POST /auth/verify-pin locks after 3 failed attempts / 5 min per user
  ✓ AI endpoints throttle at 30 req/hour per business
  ✓ POST /website/booking throttles at 10 submissions/hour per IP
```

---

## Known Limitations

This section documents the intentional constraints, out-of-scope decisions, and technical boundaries of the current platform. These are not bugs — they are deliberate trade-offs made for the current product scope. Each item notes what is unsupported and why.

---

### Authentication & Access

| #   | Limitation                             | Detail                                                                                                                                    |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Single active session per user**     | Only one refresh token is valid at a time. Signing in on a second device invalidates the first. Multi-session support is not implemented. |
| 2   | **No OAuth / social login**            | Authentication is credential-only (email + password + PIN). Google, Apple, or Microsoft SSO is out of scope.                              |
| 3   | **No passwordless / magic-link login** | Email-based magic links or OTP codes are not supported. Login always requires a password.                                                 |

---

### Multi-Tenancy & Business Structure

| #   | Limitation                         | Detail                                                                                                                              |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 7   | **One business per owner account** | A `User` with `role = owner` can only own a single business. There is no support for managing multiple businesses from one account. |
| 8   | **No sub-tenants or franchises**   | The data model is flat — there are no parent/child business relationships, regions, or franchise hierarchies.                       |

---

### Subscription & Billing

| #   | Limitation                             | Detail                                                                                                        |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 11  | **No proration or mid-cycle upgrades** | Plan upgrades/downgrades take effect at the next billing cycle. Mid-cycle proration logic is not implemented. |

---

### Real-Time & WebSocket

| #   | Limitation                                     | Detail                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | **No message push notifications**              | When a client or employee is offline, incoming messages are stored and retrieved on next connect. There is no FCM / APNs push notification to alert them while the app is closed.                                                             |
| 17  | **Presence TTL is 30 minutes, not indefinite** | The `presence:{businessId}` Redis hash expires after 30 minutes (`WS_PRESENCE`). A socket that stays connected longer than 30 minutes without a reconnect will disappear from the online list unless a heartbeat mechanism refreshes the TTL. |
| 20  | **Client-side chat is one-way authenticated**  | The `/chat` WebSocket namespace requires a JWT. Unauthenticated clients (e.g., website visitors who haven't created an account) cannot use the real-time chat channel directly.                                                               |

---

### Jobs, Scheduling & Time Tracking

| #   | Limitation                                           | Detail                                                                                                                                    |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 21  | **No recurring job templates**                       | Jobs are one-off. There is no built-in recurrence engine for weekly/monthly service contracts that auto-creates future jobs.              |
| 22  | **No GPS / location tracking**                       | The platform does not record employee GPS coordinates during clock-in/out or while on a job. Field location verification is out of scope. |
| 23  | **No calendar sync (Google / Outlook)**              | Schedules cannot be pushed to or pulled from external calendars. Export to iCal format is not implemented.                                |
| 24  | **No automated job assignment / dispatch**           | Jobs are assigned manually. There is no route optimisation, workload balancing, or automatic dispatch logic.                              |
| 25  | **Clock records are per-day, not spanning midnight** | The time tracking model assumes a clock-in and clock-out within the same calendar day. Shifts that span midnight are not modelled.        |

---

### Invoices, Payments & Finance

| #   | Limitation                                    | Detail                                                                                                                                             |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | **No online payment collection from clients** | Invoices can be sent to clients but the platform does not process card payments directly. Payment recording is manual (cash, bank transfer, etc.). |
| 27  | **No multi-currency support**                 | All monetary values are stored as numbers without a currency code. The platform assumes a single currency per business.                            |
| 28  | **No tax calculation engine**                 | Tax lines on invoices are manually entered. There is no integration with a tax API (e.g., TaxJar, Avalara) and no jurisdiction-based tax logic.    |
| 29  | **No refunds or credit notes**                | There is no `Refund` or `CreditNote` model. Overpayment or dispute resolution must be handled outside the platform.                                |
| 30  | **No accounting software sync**               | There is no integration with QuickBooks, Xero, FreshBooks, or similar. Financial exports are limited to PDF invoices.                              |

---

### Files & Contracts

| #   | Limitation                                    | Detail                                                                                                                                                                       |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 31  | **No e-signature integration**                | Contracts can be generated and sent but there is no built-in e-signature workflow (DocuSign, HelloSign, etc.). Signature tracking is manual.                                 |
| 32  | **Max file upload size: 10 MB per file**      | Files larger than 10 MB are rejected with `400 FILE_TOO_LARGE` before any upload begins. Multi-part resumable uploads are not supported.                                     |
| 33  | **No file versioning**                        | Re-uploading a file with the same name creates a new record; there is no version history for a given document.                                                               |
| 34  | **Cloudinary resource deletion is permanent** | When a `File` document is deleted, the Cloudinary resource is destroyed asynchronously via `cloudinary.uploader.destroy()`. There is no soft-delete at the Cloudinary level. |

---

### Analytics & AI

| #   | Limitation                                      | Detail                                                                                                                                                  |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 35  | **Analytics are business-scoped only**          | There are no cross-business or platform-wide aggregate analytics. Each business sees only its own data.                                                 |
| 36  | **No custom report builder**                    | Analytics endpoints return fixed, predefined metrics. Users cannot build custom queries, define custom date dimensions, or export raw data to BI tools. |
| 37  | **AI advisor has no memory between sessions**   | Each AI advisor conversation starts fresh. There is no persistent conversation history used as context for future sessions.                             |
| 38  | **AI responses are not streamed**               | The `/ai/advisor` endpoint waits for the full Claude response before returning. Server-sent events (SSE) or streaming responses are not implemented.    |
| 39  | **AI rate limit is per-business, not per-user** | The 30 req/hour AI throttle applies to the whole business, not individual employees. A single heavy user can exhaust the quota for everyone.            |

---

### Website Builder & Public-Facing Pages

| #   | Limitation                                           | Detail                                                                                                                                                                   |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 40  | **Subdomain hosting is not managed by this backend** | The website builder stores configuration but DNS provisioning, SSL certificate issuance, and subdomain routing are infrastructure concerns not handled in this codebase. |
| 41  | **No A/B testing or multi-page websites**            | Each business has a single public page. Multiple pages, landing page variants, or A/B test experiments are not supported.                                                |
| 42  | **Booking form is unauthenticated**                  | `POST /website/booking` is a public endpoint — it does not require a client account. Spam protection relies solely on rate limiting (10 submissions/hour per IP).        |
| 43  | **No payment collection on the booking form**        | Service requests submitted via the public booking form cannot collect a deposit or partial payment at submission time.                                                   |

---

### Infrastructure & Operations

| #   | Limitation                              | Detail                                                                                                                                                                           |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 44  | **Redis is a single point of failure**  | Cache (TTLs), rate limiting, presence, and API key validation all depend on Redis. There is no fallback path if Redis is unavailable — requests requiring cached data will fail. |
| 45  | **No event sourcing or CQRS**           | The architecture is request/response with soft-deletes. There is no event store, domain event bus, or read/write model separation.                                               |
| 46  | **No outbox pattern for emails**        | Emails (invitation, invoice, etc.) are sent inline within the request lifecycle. If the mail provider is unavailable, the operation may partially fail without retry.            |
| 47  | **No database sharding**                | All business data lives in a single MongoDB Atlas cluster. Sharding or cross-region replication is an infrastructure concern outside this codebase.                              |
| 48  | **No zero-downtime migration strategy** | There is no migration runner or schema versioning tool. Database schema changes require manual coordination with deployment.                                                     |

---

_This document is the single source of truth for the Servix OS backend. Update it whenever the API contract changes._

---

---

# Servix OS — Client Portal API Documentation

## Table of Contents

1. [Overview](#client-overview)
2. [Architecture: Decoupled Client Portal](#architecture-decoupled-client-portal)
3. [Tech Stack](#client-tech-stack)
4. [Project Structure](#client-project-structure)
5. [Standard Response Format](#client-standard-response-format)
6. [Data Models & Schemas](#client-data-models--schemas)
7. [API Endpoints](#client-api-endpoints)
8. [WebSocket Gateway (Messages)](#client-websocket-gateway)
9. [Integration Test Suites](#client-integration-test-suites)

---

## Client Overview

The **Servix OS Client Portal** is a read-oriented, client-facing API that allows end-clients (customers of a service provider) to:

- Authenticate with their own credentials (separate from the business owner login)
- View invoices issued to them and track outstanding balances
- Sign contracts sent by their service provider
- Download shared files
- Message their service provider in real-time
- View their activity log and profile

The client portal operates under a **separate API namespace** (`/client/api`) and uses its own JWT strategy, guards, and module set. It has **read-only or restricted-write** access to the shared MongoDB collections — it never modifies business-owner data.

---

## Architecture: Decoupled Client Portal

### Why Decoupled?

The business-owner API (`/api`) and the client portal API (`/client/api`) serve fundamentally different audiences with different trust boundaries, permission models, and data access patterns. Coupling them into the same module graph would create:

- Accidental privilege escalation risks (a client guard leaking into a business route)
- Tangled service layers that become harder to change independently
- A single blast radius for auth failures across both audiences

### Decoupling Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                     NestJS Application                       │
│                                                             │
│  ┌──────────────────────┐   ┌──────────────────────────┐   │
│  │  Business API        │   │  Client Portal API       │   │
│  │  /api                │   │  /client/api          │   │
│  │                      │   │                          │   │
│  │  JwtBusinessGuard    │   │  JwtClientGuard          │   │
│  │  TenantGuard         │   │  ClientOwnershipGuard    │   │
│  │  RbacGuard           │   │                          │   │
│  │                      │   │  (no RBAC — clients have │   │
│  │  BusinessModule       │   │   no permission system) │   │
│  │  EmployeeModule       │   │                          │   │
│  │  JobsModule           │   │  ClientAuthModule        │   │
│  │  PaymentsModule       │   │  ClientDashboardModule   │   │
│  │  ...                 │   │  ClientInvoicesModule    │   │
│  └──────────────────────┘   │  ClientContractsModule   │   │
│                             │  ClientFilesModule       │   │
│  Shared Domain Layer        │  ClientMessagesModule    │   │
│  ┌──────────────────────┐   │  ClientActivitiesModule  │   │
│  │  Mongoose Schemas    │◄──│  ClientProfileModule     │   │
│  │  (read-only refs     │   │  ClientContactsModule    │   │
│  │   from client side)  │   └──────────────────────────┘   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

**Rules of the boundary:**

1. Client modules **never import** business-side service classes directly. They import only shared schemas and repositories.
2. The `JwtClientGuard` issues tokens with `sub = clientId` and `audience = "client"`. The `JwtBusinessGuard` rejects tokens with `audience = "client"` — and vice versa.
3. The `ClientOwnershipGuard` ensures a client can only access documents where `clientId` matches their JWT `sub`. It runs on every protected client route.
4. Writes from the client side are limited to: signing contracts, sending messages, updating their own profile, and changing their password.

### Shared vs. Isolated

| Layer           | Shared?          | Notes                                                       |
| --------------- | ---------------- | ----------------------------------------------------------- |
| MongoDB schemas | Yes              | Client reads from `invoices`, `contracts`, `files`, etc.    |
| Mongoose models | Yes              | Registered once in `DatabaseModule`, imported by both sides |
| JWT secret      | No               | Separate `CLIENT_JWT_SECRET` env var                        |
| Redis cache     | Yes (namespaced) | Client cache keys prefixed `client:` to avoid collision     |
| Services        | No               | `ClientInvoicesService` ≠ `InvoicesService`                 |
| Controllers     | No               | Completely separate route handlers                          |
| Guards          | No               | `JwtClientGuard` ≠ `JwtAuthGuard`                           |

---

## Client Tech Stack

| Concern    | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Runtime    | Node.js (LTS) — same process as business API            |
| Framework  | NestJS (same app, separate module graph branch)         |
| Language   | TypeScript (strict)                                     |
| Database   | MongoDB — same cluster, same collections                |
| ODM        | Typegoose (Mongoose)                                    |
| Caching    | Redis — same instance, namespaced keys                  |
| Auth       | JWT (access + refresh tokens, separate secret) + bcrypt |
| Real-time  | Socket.io — separate namespace `/client-messages`       |
| Validation | `class-validator` + `class-transformer`                 |
| Testing    | Jest + Supertest + MongoMemoryServer                    |

---

## Client Project Structure

```
src/
├── client/                          ← all client portal code lives here
│   ├── client.module.ts             ← top-level module, registers all sub-modules
│   │
│   ├── common/
│   │   ├── guards/
│   │   │   ├── jwt-client-auth.guard.ts      ← verifies client JWT (audience="client")
│   │   │   ├── client-ownership.guard.ts     ← enforces clientId === req.client.id
│   │   │   └── ws-jwt-client-auth.guard.ts   ← WS version of JWT guard
│   │   ├── decorators/
│   │   │   └── client.decorator.ts           ← @Client() param decorator
│   │   ├── strategies/
│   │   │   └── jwt-client.strategy.ts        ← Passport strategy, audience="client"
│   │   └── interceptors/
│   │       └── client-cache.interceptor.ts   ← wraps CacheInterceptor with client: prefix
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts            ← /client/api/auth/*
│   │   │   ├── auth.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   ├── forgot-password.dto.ts
│   │   │   │   ├── verify-otp.dto.ts
│   │   │   │   └── reset-password.dto.ts
│   │   │   └── schemas/
│   │   │       ├── client.schema.ts          ← Client document (defined here)
│   │   │       ├── otp-verification.schema.ts
│   │   │       └── refresh-token.schema.ts
│   │   │
│   │   ├── dashboard/
│   │   │   ├── dashboard.module.ts
│   │   │   ├── dashboard.controller.ts
│   │   │   └── dashboard.service.ts
│   │   │
│   │   ├── invoices/
│   │   │   ├── invoices.module.ts
│   │   │   ├── invoices.controller.ts
│   │   │   ├── invoices.service.ts
│   │   │   └── dto/
│   │   │       └── list-invoices.dto.ts
│   │   │
│   │   ├── contracts/
│   │   │   ├── contracts.module.ts
│   │   │   ├── contracts.controller.ts
│   │   │   ├── contracts.service.ts
│   │   │   └── dto/
│   │   │       ├── list-contracts.dto.ts
│   │   │       └── sign-contract.dto.ts
│   │   │
│   │   ├── files/
│   │   │   ├── files.module.ts
│   │   │   ├── files.controller.ts
│   │   │   └── files.service.ts
│   │   │
│   │   ├── messages/
│   │   │   ├── messages.module.ts
│   │   │   ├── messages.controller.ts        ← HTTP REST (read-only)
│   │   │   ├── messages.service.ts           ← shared by controller + gateway
│   │   │   ├── messages.gateway.ts           ← Socket.io /client-messages namespace
│   │   │   └── dto/
│   │   │       └── ws-send-message.dto.ts
│   │   │
│   │   ├── activities/
│   │   │   ├── activities.module.ts
│   │   │   ├── activities.controller.ts
│   │   │   └── activities.service.ts
│   │   │
│   │   ├── contacts/
│   │   │   ├── contacts.module.ts
│   │   │   ├── contacts.controller.ts
│   │   │   └── contacts.service.ts
│   │   │
│   │   └── profile/
│   │       ├── profile.module.ts
│   │       ├── profile.controller.ts
│   │       ├── profile.service.ts
│   │       └── dto/
│   │           ├── update-profile.dto.ts
│   │           └── change-password.dto.ts
│   │
│   └── constants/
│       ├── cache-keys.ts            ← CACHE_KEYS.client.*
│       ├── cache-ttls.ts            ← CLIENT_CACHE_TTLS.*
│       └── messages.ts              ← CLIENT_MESSAGES.SUCCESS.* / ERROR.*
```

---

## Client Standard Response Format

Identical envelope to the business API:

```typescript
// Success
{
  "success": true,
  "message": "string",
  "data": T | null,
  "meta"?: PaginationMeta,       // list endpoints only
  "timestamp": "ISO 8601"
}

// Error
{
  "success": false,
  "message": "string",
  "error": "string",
  "statusCode": number,
  "timestamp": "ISO 8601"
}
```

```typescript
// PaginationMeta
{
  "total": number,
  "page": number,
  "limit": number,
  "totalPages": number,
  "hasNextPage": boolean,
  "hasPreviousPage": boolean
}
```

---

## Client Data Models & Schemas

### ServiceProvider

```typescript
// src/client/modules/auth/schemas/service-provider.schema.ts
import { prop, modelOptions, index } from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'service_providers', timestamps: true },
})
@index({ supportEmail: 1 }, { unique: true })
export class ServiceProvider {
  @prop({ required: true, trim: true })
  businessName: string;

  @prop({ required: true, lowercase: true, trim: true })
  supportEmail: string;

  @prop({ required: true, trim: true })
  phone: string;

  @prop({ required: true, trim: true })
  address: string;

  @prop({ trim: true })
  logoUrl?: string;

  @prop({ trim: true })
  website?: string;

  @prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

**MongoDB Indexes:**

```
supportEmail  UNIQUE ASC
isActive      ASC
```

---

### Client

```typescript
// src/client/modules/auth/schemas/client.schema.ts
import { prop, modelOptions, index, Ref } from '@typegoose/typegoose';
import { ServiceProvider } from './service-provider.schema';

@modelOptions({ schemaOptions: { collection: 'clients', timestamps: true } })
@index({ email: 1 }, { unique: true })
@index({ serviceProviderId: 1 })
@index({ serviceProviderId: 1, isActive: 1 })
export class Client {
  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ required: true })
  passwordHash: string; // bcrypt hash, never returned in responses

  @prop({ required: true, trim: true })
  firstName: string;

  @prop({ required: true, trim: true })
  lastName: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ trim: true })
  avatarUrl?: string;

  @prop({ ref: () => ServiceProvider, required: true })
  serviceProviderId: Ref<ServiceProvider>;

  @prop({ default: true })
  isActive: boolean;

  @prop()
  lastLoginAt?: Date;

  @prop({ default: false })
  isEmailVerified: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

**MongoDB Indexes:**

```
email                         UNIQUE ASC
serviceProviderId             ASC
serviceProviderId + isActive  COMPOUND ASC
```

---

### OtpVerification

```typescript
// src/client/modules/auth/schemas/otp-verification.schema.ts
import { prop, modelOptions, index } from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'otp_verifications', timestamps: true },
})
@index({ email: 1 })
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL — MongoDB auto-deletes expired docs
export class OtpVerification {
  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ required: true })
  otpHash: string; // bcrypt hash of the 6-digit OTP

  @prop({ required: true })
  expiresAt: Date; // now + 120 seconds

  @prop({ default: false })
  isUsed: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### RefreshToken

```typescript
// src/client/modules/auth/schemas/refresh-token.schema.ts
import { prop, modelOptions, index, Ref } from '@typegoose/typegoose';
import { Client } from './client.schema';

@modelOptions({
  schemaOptions: { collection: 'refresh_tokens', timestamps: true },
})
@index({ clientId: 1 })
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL index
export class RefreshToken {
  @prop({ ref: () => Client, required: true })
  clientId: Ref<Client>;

  @prop({ required: true })
  tokenHash: string; // SHA-256 hash of the raw refresh token

  @prop({ required: true })
  expiresAt: Date;

  @prop({ default: false })
  isRevoked: boolean;

  @prop({ trim: true })
  userAgent?: string;

  @prop({ trim: true })
  ipAddress?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### Invoice (read-only from client side)

```typescript
// src/modules/invoices/schemas/invoice.schema.ts
export enum InvoiceStatus {
  PAID = 'paid',
  PARTIAL = 'partial',
  UNPAID = 'unpaid',
}

export class InvoiceLineItem {
  @prop({ required: true, trim: true })
  description: string;

  @prop({ required: true, min: 1 })
  quantity: number;

  @prop({ required: true, min: 0 })
  unitPrice: number;

  @prop({ required: true, min: 0 })
  total: number;
}

@modelOptions({ schemaOptions: { collection: 'invoices', timestamps: true } })
@index({ clientId: 1, status: 1 })
@index({ clientId: 1, dueDate: 1 })
@index({ serviceProviderId: 1 })
@index({ invoiceNumber: 1, serviceProviderId: 1 }, { unique: true })
export class Invoice {
  @prop({ required: true, trim: true })
  invoiceNumber: string;

  @prop({ ref: () => Client, required: true })
  clientId: Ref<Client>;

  @prop({ ref: () => ServiceProvider, required: true })
  serviceProviderId: Ref<ServiceProvider>;

  @prop({ required: true })
  issuedDate: Date;

  @prop({ required: true })
  dueDate: Date;

  @prop({ required: true, min: 0 })
  amount: number; // in cents (integer)

  @prop({ enum: InvoiceStatus, default: InvoiceStatus.UNPAID })
  status: InvoiceStatus;

  @prop({ type: () => [InvoiceLineItem], default: [] })
  lineItems: InvoiceLineItem[];

  @prop({ trim: true })
  notes?: string;

  @prop({ trim: true })
  currency: string; // ISO 4217 e.g. "USD"

  createdAt: Date;
  updatedAt: Date;
}
```

**MongoDB Indexes:**

```
clientId + status                    COMPOUND ASC
clientId + dueDate                   COMPOUND ASC
serviceProviderId                    ASC
invoiceNumber + serviceProviderId    COMPOUND UNIQUE
```

---

### Contract

```typescript
// src/modules/contracts/schemas/contract.schema.ts
export enum ContractStatus {
  AWAITING_SIGNATURE = 'awaiting_signature',
  SIGNED = 'signed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@modelOptions({ schemaOptions: { collection: 'contracts', timestamps: true } })
@index({ clientId: 1, status: 1 })
@index({ serviceProviderId: 1 })
@index({ clientId: 1, dateSent: -1 })
export class Contract {
  @prop({ required: true, trim: true })
  name: string;

  @prop({ ref: () => Client, required: true })
  clientId: Ref<Client>;

  @prop({ ref: () => ServiceProvider, required: true })
  serviceProviderId: Ref<ServiceProvider>;

  @prop({ required: true })
  dateSent: Date;

  @prop()
  expiresAt?: Date;

  @prop({ required: true, min: 0 })
  amount: number; // contract value in cents

  @prop({ enum: ContractStatus, default: ContractStatus.AWAITING_SIGNATURE })
  status: ContractStatus;

  @prop({ required: true })
  content: string; // full contract text / HTML

  @prop()
  signedAt?: Date;

  @prop({ trim: true })
  signatureImageUrl?: string; // S3 URL of rendered signature image

  @prop({ trim: true })
  signatureData?: string; // base64 data URL of canvas signature

  @prop({ trim: true })
  currency: string;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### SharedFile (read-only from client side)

```typescript
// src/modules/files/schemas/file.schema.ts
export enum FileFormat {
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  XLSX = 'xlsx',
  PNG = 'png',
  JPG = 'jpg',
  ZIP = 'zip',
}

@modelOptions({ schemaOptions: { collection: 'files', timestamps: true } })
@index({ clientId: 1, createdAt: -1 })
@index({ serviceProviderId: 1 })
export class SharedFile {
  @prop({ required: true, trim: true })
  filename: string;

  @prop({ required: true, enum: FileFormat })
  format: FileFormat;

  @prop({ required: true, min: 0 })
  filesizeBytes: number;

  @prop({ required: true, trim: true })
  storageKey: string; // S3 object key — never exposed in responses

  @prop({ ref: () => Client, required: true })
  clientId: Ref<Client>;

  @prop({ ref: () => ServiceProvider, required: true })
  serviceProviderId: Ref<ServiceProvider>;

  @prop()
  generatedDate?: Date;

  @prop({ default: false })
  isDeleted: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### Conversation

```typescript
// src/modules/messages/schemas/conversation.schema.ts
@modelOptions({
  schemaOptions: { collection: 'conversations', timestamps: true },
})
@index({ clientId: 1, serviceProviderId: 1 }, { unique: true })
@index({ clientId: 1, lastMessageAt: -1 })
export class Conversation {
  @prop({ ref: () => Client, required: true })
  clientId: Ref<Client>;

  @prop({ ref: () => ServiceProvider, required: true })
  serviceProviderId: Ref<ServiceProvider>;

  @prop({ trim: true })
  lastMessageContent?: string;

  @prop()
  lastMessageAt?: Date;

  @prop({ default: 0, min: 0 })
  clientUnreadCount: number;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### Message

```typescript
// src/modules/messages/schemas/message.schema.ts
export enum MessageSender {
  CLIENT = 'client',
  BUSINESS = 'business',
}

export class MessageAttachment {
  @prop({ required: true, trim: true })
  filename: string;

  @prop({ required: true, trim: true })
  storageKey: string;

  @prop({ required: true, min: 0 })
  filesizeBytes: number;
}

@modelOptions({ schemaOptions: { collection: 'messages', timestamps: true } })
@index({ conversationId: 1, createdAt: -1 })
@index({ conversationId: 1, isRead: 1 })
export class Message {
  @prop({ ref: () => Conversation, required: true })
  conversationId: Ref<Conversation>;

  @prop({ required: true, enum: MessageSender })
  sender: MessageSender;

  @prop({ required: true, trim: true })
  senderName: string;

  @prop({ required: true, trim: true })
  content: string;

  @prop({ default: false })
  isRead: boolean;

  @prop({ type: () => [MessageAttachment], default: [] })
  attachments: MessageAttachment[];

  createdAt: Date;
  updatedAt: Date;
}
```

---

### Activity

```typescript
// src/modules/activities/schemas/activity.schema.ts
export enum ActivityType {
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  CONTRACT = 'contract',
  FILE = 'file',
  MESSAGE = 'message',
}

export enum ActivityReferenceModel {
  INVOICE = 'Invoice',
  CONTRACT = 'Contract',
  FILE = 'SharedFile',
  MESSAGE = 'Message',
}

@modelOptions({ schemaOptions: { collection: 'activities', timestamps: true } })
@index({ clientId: 1, createdAt: -1 })
@index({ serviceProviderId: 1 })
@index({ type: 1 })
export class Activity {
  @prop({ ref: () => Client, required: true })
  clientId: Ref<Client>;

  @prop({ ref: () => ServiceProvider, required: true })
  serviceProviderId: Ref<ServiceProvider>;

  @prop({ required: true, trim: true })
  description: string;

  @prop({ required: true, enum: ActivityType })
  type: ActivityType;

  @prop({ trim: true })
  referenceId?: string;

  @prop({ enum: ActivityReferenceModel })
  referenceModel?: ActivityReferenceModel;

  createdAt: Date;
  updatedAt: Date;
}
```

---

## Client API Endpoints

### Base URL: `/client/api`

All protected routes require: `Authorization: Bearer <access_token>`

The `JwtClientGuard` validates tokens signed with `CLIENT_JWT_SECRET` and `audience: "client"`. Tokens issued by the business-owner auth flow are rejected here — and vice versa.

---

### Auth Module — `/client/api/auth`

#### `POST /auth/login`

**Request Body:**

```json
{
  "email": "client@example.com",
  "password": "securepassword"
}
```

**DTO:**

```typescript
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password: string;
}
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900,
    "client": {
      "id": "64a1b2c3d4e5f6a7b8c9d0e1",
      "email": "client@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "avatarUrl": null,
      "serviceProviderId": "64a1b2c3d4e5f6a7b8c9d0e2"
    }
  },
  "timestamp": "2026-04-14T10:00:00.000Z"
}
```

**Errors:** `401` Invalid credentials · `403` Account inactive

---

#### `POST /auth/logout`

Requires auth. Revokes the current refresh token.

**Request Body:**

```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:** `{ "success": true, "message": "Logged out successfully", "data": null }`

---

#### `POST /auth/refresh-token`

**Request Body:**

```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:** Same shape as login `data`.

**Errors:** `401` Invalid/expired/revoked refresh token

---

#### `POST /auth/forgot-password`

**Request Body:**

```json
{ "email": "client@example.com" }
```

**Response `200`:**

```json
{
  "success": true,
  "message": "OTP sent to your email address",
  "data": { "expiresInSeconds": 120 },
  "timestamp": "..."
}
```

> Always returns `200` even when the email does not exist (prevents enumeration).

---

#### `POST /auth/verify-otp`

**Request Body:**

```json
{ "email": "client@example.com", "otp": "483920" }
```

**Response `200`:**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": { "resetToken": "<signed-jwt-valid-5-min>" },
  "timestamp": "..."
}
```

**Errors:** `400` OTP invalid · `400` OTP expired · `400` OTP already used

---

#### `POST /auth/reset-password`

**Request Body:**

```json
{
  "resetToken": "<jwt>",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Response `200`:** `{ "success": true, "message": "Password reset successfully", "data": null }`

**Errors:** `400` Passwords mismatch · `400` Same as current · `401` Reset token invalid

---

### Dashboard Module — `/client/api/dashboard`

#### `GET /dashboard`

Returns aggregated stats. **Cached per client.**

**Response `200`:**

```json
{
  "success": true,
  "message": "Dashboard data retrieved successfully",
  "data": {
    "outstandingBalance": 1245000,
    "totalPaid": 780000,
    "pendingContractsCount": 2,
    "recentActivities": [
      {
        "id": "...",
        "description": "Invoice INV-008 was issued",
        "type": "invoice",
        "date": "2026-04-10T00:00:00.000Z"
      }
    ]
  },
  "timestamp": "..."
}
```

> `outstandingBalance` = sum of `unpaid` + `partial` invoices in cents.
> `totalPaid` = sum of `paid` invoices in cents.
> `recentActivities` = latest 10 activity records.

---

### Invoices Module — `/client/api/invoices`

#### `GET /invoices`

**Query Parameters:**

| Param    | Type                              | Default   | Description      |
| -------- | --------------------------------- | --------- | ---------------- |
| `page`   | `number`                          | `1`       | Page number      |
| `limit`  | `number` (max 100)                | `10`      | Items per page   |
| `status` | `paid \| partial \| unpaid`       | —         | Filter by status |
| `from`   | `ISO date`                        | —         | issuedDate >=    |
| `to`     | `ISO date`                        | —         | issuedDate <=    |
| `sort`   | `dueDate \| amount \| issuedDate` | `dueDate` | Sort field       |
| `order`  | `asc \| desc`                     | `desc`    | Sort direction   |

**Response `200`:**

```json
{
  "success": true,
  "message": "Invoices retrieved successfully",
  "data": [
    {
      "id": "64a...",
      "invoiceNumber": "INV-001",
      "issuedDate": "2026-01-15T00:00:00.000Z",
      "dueDate": "2026-02-15T00:00:00.000Z",
      "amount": 250000,
      "status": "unpaid",
      "currency": "USD"
    }
  ],
  "meta": {
    "total": 8,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "timestamp": "..."
}
```

---

#### `GET /invoices/:id`

**Response `200`:**

```json
{
  "data": {
    "id": "64a...",
    "invoiceNumber": "INV-001",
    "issuedDate": "...",
    "dueDate": "...",
    "amount": 250000,
    "status": "unpaid",
    "currency": "USD",
    "notes": "Net 30 payment terms",
    "lineItems": [
      {
        "description": "Web Design",
        "quantity": 1,
        "unitPrice": 250000,
        "total": 250000
      }
    ],
    "serviceProvider": {
      "businessName": "Servix Solutions",
      "supportEmail": "support@servix.com"
    }
  }
}
```

**Errors:** `404` Not found · `403` Access denied

---

### Contracts Module — `/client/api/contracts`

#### `GET /contracts`

**Query Parameters:**

| Param    | Type                                                   | Default    |
| -------- | ------------------------------------------------------ | ---------- |
| `page`   | `number`                                               | `1`        |
| `limit`  | `number`                                               | `10`       |
| `status` | `awaiting_signature \| signed \| expired \| cancelled` | —          |
| `sort`   | `dateSent \| amount`                                   | `dateSent` |
| `order`  | `asc \| desc`                                          | `desc`     |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "64a...",
      "name": "Web Redesign Contract",
      "dateSent": "2026-01-10T00:00:00.000Z",
      "amount": 500000,
      "status": "awaiting_signature",
      "currency": "USD"
    }
  ]
}
```

---

#### `GET /contracts/:id`

**Response `200`:**

```json
{
  "data": {
    "id": "...",
    "name": "Web Redesign Contract",
    "dateSent": "...",
    "expiresAt": "...",
    "amount": 500000,
    "status": "awaiting_signature",
    "content": "This Agreement is entered into...",
    "signedAt": null,
    "currency": "USD"
  }
}
```

---

#### `PATCH /contracts/:id/sign`

**Request Body:**

```json
{
  "signatureData": "data:image/png;base64,iVBORw0KGgo..."
}
```

**DTO:**

```typescript
export class SignContractDto {
  @IsString()
  @IsNotEmpty({ message: 'A signature is required to sign this contract' })
  @Matches(/^data:image\/(png|jpeg);base64,/, {
    message: 'Invalid signature format',
  })
  signatureData: string;
}
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Contract signed successfully",
  "data": {
    "id": "...",
    "status": "signed",
    "signedAt": "2026-04-14T10:00:00.000Z"
  }
}
```

**Errors:** `404` Not found · `403` Access denied · `409` Already signed

**Side effects:** Creates an `Activity` record with `type = "contract"`. Invalidates contract list cache, single contract cache, and dashboard cache.

---

### Files Module — `/client/api/files`

#### `GET /files`

**Query Parameters:**

| Param    | Type                                         | Default     |
| -------- | -------------------------------------------- | ----------- |
| `page`   | `number`                                     | `1`         |
| `limit`  | `number`                                     | `10`        |
| `format` | `pdf \| doc \| docx \| xlsx \| png \| jpg`   | —           |
| `sort`   | `generatedDate \| filename \| filesizeBytes` | `createdAt` |
| `order`  | `asc \| desc`                                | `desc`      |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "...",
      "filename": "Project_Proposal",
      "format": "pdf",
      "filesizeBytes": 2516582,
      "generatedDate": "2026-03-10T00:00:00.000Z"
    }
  ]
}
```

> `storageKey` is **never** returned.

---

#### `GET /files/:id/download`

**Response `200`:**

```json
{
  "success": true,
  "message": "Download URL generated successfully",
  "data": {
    "downloadUrl": "https://s3.amazonaws.com/...",
    "expiresInSeconds": 3600,
    "filename": "Project_Proposal.pdf"
  }
}
```

**Errors:** `404` Not found · `403` Access denied

---

### Messages Module — `/client/api/messages`

> **Transport split**: HTTP handles read-only operations (initial page load). Sending and receiving real-time messages are handled exclusively by the WebSocket gateway (namespace `/client-messages`). Both share the same `ClientMessagesService`.

#### `GET /messages/conversations`

**Response `200`:**

```json
{
  "data": [
    {
      "id": "64a...",
      "serviceProvider": {
        "id": "...",
        "businessName": "Servix Solutions",
        "supportEmail": "support@servix.com",
        "avatarInitials": "SS"
      },
      "lastMessageContent": "We've reviewed your requirements...",
      "lastMessageAt": "2026-04-13T14:30:00.000Z",
      "clientUnreadCount": 3
    }
  ]
}
```

---

#### `GET /messages/conversations/:providerId`

**Query Parameters:**

| Param   | Type     | Default |
| ------- | -------- | ------- |
| `page`  | `number` | `1`     |
| `limit` | `number` | `20`    |

**Response `200`:** Paginated message list — newest first.

```json
{
  "data": [
    {
      "id": "...",
      "sender": "business",
      "senderName": "Servix Solutions",
      "content": "Hello! We've reviewed your requirements.",
      "isRead": true,
      "attachments": [],
      "createdAt": "2026-04-13T14:30:00.000Z"
    }
  ],
  "meta": { "total": 17, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

#### `PATCH /messages/conversations/:providerId/read`

Marks all unread messages as read. Resets `clientUnreadCount` to 0.

**Response `200`:** `{ "success": true, "message": "Messages marked as read", "data": null }`

**Side effects:** Emits `message_read` and `conversation_updated` WS events to the conversation room.

---

### Contacts Module — `/client/api/contacts`

#### `GET /contacts`

**Response `200`:**

```json
{
  "data": [
    {
      "id": "...",
      "businessName": "Servix Solutions",
      "supportEmail": "support@servix.com",
      "phone": "+1 (555) 100-2000",
      "address": "123 Main St, New York, NY 10001",
      "website": "https://servix.com",
      "logoUrl": null
    }
  ]
}
```

---

### Activities Module — `/client/api/activities`

#### `GET /activities`

**Query Parameters:**

| Param   | Type                                                | Default |
| ------- | --------------------------------------------------- | ------- |
| `page`  | `number`                                            | `1`     |
| `limit` | `number`                                            | `10`    |
| `type`  | `invoice \| payment \| contract \| file \| message` | —       |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "...",
      "description": "Invoice INV-008 was issued",
      "type": "invoice",
      "referenceId": "64a...",
      "date": "2026-04-10T00:00:00.000Z"
    }
  ],
  "meta": { "total": 10, "page": 1, "limit": 10, "totalPages": 1 }
}
```

---

### Profile Module — `/client/api/profile`

#### `GET /profile`

**Response `200`:**

```json
{
  "data": {
    "id": "...",
    "email": "client@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1 555 000 1234",
    "avatarUrl": null,
    "isEmailVerified": true,
    "lastLoginAt": "2026-04-14T09:00:00.000Z",
    "serviceProvider": {
      "id": "...",
      "businessName": "Servix Solutions"
    }
  }
}
```

---

#### `PATCH /profile`

**Request Body:**

```json
{
  "firstName": "Jonathan",
  "lastName": "Doe",
  "phone": "+1 555 000 9999"
}
```

**DTO:**

```typescript
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;
}
```

**Response `200`:** Updated profile object (same shape as GET /profile data).

**Side effects:** Invalidates `CACHE_KEYS.client.profile(clientId)`.

---

#### `PATCH /profile/change-password`

**Request Body:**

```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Response `200`:** `{ "success": true, "message": "Password changed successfully", "data": null }`

**Errors:** `400` Current password wrong · `400` Same as current · `400` Passwords mismatch

---

## Client WebSocket Gateway

### Namespace: `/client-messages`

> Kept separate from the business-side Socket.io namespace to enforce the auth boundary — the `WsJwtClientAuthGuard` only accepts tokens with `audience: "client"`.

**URL:** `ws://<host>/client-messages`

The client passes a valid JWT access token in the Socket.IO handshake:

```typescript
const socket = io('ws://api.servixos.com/client-messages', {
  auth: { token: accessToken },
});
```

On successful connection the server emits:

```json
{
  "event": "connected",
  "data": { "clientId": "64a...", "message": "Connected" }
}
```

---

### Gateway Implementation Outline

```typescript
// src/client/modules/messages/messages.gateway.ts

@WebSocketGateway({
  namespace: '/client-messages',
  cors: { origin: process.env.CLIENT_ORIGIN },
})
@UseGuards(WsJwtClientAuthGuard)
export class ClientMessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(private readonly messagesService: ClientMessagesService) {}

  async handleConnection(client: AuthenticatedSocket) {
    client.emit(MESSAGE_EVENTS.CONNECTED, { clientId: client.data.clientId });
  }

  async handleDisconnect(_client: AuthenticatedSocket) {}

  @SubscribeMessage(MESSAGE_EVENTS.JOIN_CONVERSATION)
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { providerId: string },
  ) {
    const roomId = buildRoomId(client.data.clientId, payload.providerId);
    await client.join(roomId);
  }

  @SubscribeMessage(MESSAGE_EVENTS.LEAVE_CONVERSATION)
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { providerId: string },
  ) {
    await client.leave(buildRoomId(client.data.clientId, payload.providerId));
  }

  @SubscribeMessage(MESSAGE_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsSendMessageDto,
  ) {
    const roomId = buildRoomId(client.data.clientId, payload.providerId);
    if (!client.rooms.has(roomId)) {
      client.emit(MESSAGE_EVENTS.ERROR, {
        message: 'Join the conversation room first',
      });
      return;
    }
    const message = await this.messagesService.sendMessage(
      client.data.clientId,
      payload.providerId,
      payload.content,
    );
    this.server.to(roomId).emit(MESSAGE_EVENTS.NEW_MESSAGE, message);
    const conversation = await this.messagesService.getConversationSummary(
      client.data.clientId,
      payload.providerId,
    );
    this.server
      .to(client.data.clientId)
      .emit(MESSAGE_EVENTS.CONVERSATION_UPDATED, conversation);
  }

  @SubscribeMessage(MESSAGE_EVENTS.MARK_READ)
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { providerId: string },
  ) {
    await this.messagesService.markConversationAsRead(
      client.data.clientId,
      payload.providerId,
    );
    const roomId = buildRoomId(client.data.clientId, payload.providerId);
    this.server.to(roomId).emit(MESSAGE_EVENTS.MESSAGE_READ, {
      clientId: client.data.clientId,
      providerId: payload.providerId,
    });
  }

  @SubscribeMessage(MESSAGE_EVENTS.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { providerId: string },
  ) {
    client
      .to(buildRoomId(client.data.clientId, payload.providerId))
      .emit(MESSAGE_EVENTS.TYPING, {
        clientId: client.data.clientId,
        isTyping: true,
      });
  }

  @SubscribeMessage(MESSAGE_EVENTS.TYPING_STOP)
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { providerId: string },
  ) {
    client
      .to(buildRoomId(client.data.clientId, payload.providerId))
      .emit(MESSAGE_EVENTS.TYPING, {
        clientId: client.data.clientId,
        isTyping: false,
      });
  }
}

function buildRoomId(clientId: string, providerId: string): string {
  return `client-conversation:${clientId}:${providerId}`;
}
```

---

### WsSendMessageDto

```typescript
export class WsSendMessageDto {
  @IsMongoId()
  @IsNotEmpty()
  providerId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }) => value.trim())
  content: string;
}
```

---

### WsJwtClientAuthGuard

```typescript
// src/client/common/guards/ws-jwt-client-auth.guard.ts
@Injectable()
export class WsJwtClientAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
      return false;
    }
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.CLIENT_JWT_SECRET,
        audience: 'client',
      });
      (client as AuthenticatedSocket).data.clientId = payload.sub;
      return true;
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
      return false;
    }
  }
}
```

---

### Client → Server Events

| Event                | Payload                                   | Description                       |
| -------------------- | ----------------------------------------- | --------------------------------- |
| `join_conversation`  | `{ providerId: string }`                  | Join the room for a conversation  |
| `leave_conversation` | `{ providerId: string }`                  | Leave a conversation room         |
| `send_message`       | `{ providerId: string, content: string }` | Save and broadcast a new message  |
| `mark_read`          | `{ providerId: string }`                  | Mark all unread messages as read  |
| `typing_start`       | `{ providerId: string }`                  | Notify counterpart typing started |
| `typing_stop`        | `{ providerId: string }`                  | Notify counterpart typing stopped |

### Server → Client Events

| Event                  | Payload                                    | Triggered when                              |
| ---------------------- | ------------------------------------------ | ------------------------------------------- |
| `connected`            | `{ clientId: string, message: string }`    | Socket authenticated and connected          |
| `new_message`          | Full message object                        | Any participant in the room sends a message |
| `message_read`         | `{ clientId: string, providerId: string }` | Counterpart marks conversation as read      |
| `conversation_updated` | Conversation summary object                | New message or unread count changes         |
| `typing`               | `{ clientId: string, isTyping: boolean }`  | Counterpart starts or stops typing          |
| `error`                | `{ message: string }`                      | Auth or validation error                    |

### Redis Adapter (Multi-instance Scaling)

```typescript
// src/main.ts
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

> Package: `@socket.io/redis-adapter`. Applies to both `/messages` (business) and `/client-messages` namespaces.

---

## Client Constants

### Cache Keys

```typescript
// src/client/constants/cache-keys.ts
export const CLIENT_CACHE_KEYS = {
  dashboard: (clientId: string) => `client:dashboard:${clientId}`,
  invoices: (clientId: string, query: string) =>
    `client:invoices:${clientId}:${query}`,
  invoice: (clientId: string, id: string) => `client:invoice:${clientId}:${id}`,
  contracts: (clientId: string, query: string) =>
    `client:contracts:${clientId}:${query}`,
  contract: (clientId: string, id: string) =>
    `client:contract:${clientId}:${id}`,
  files: (clientId: string, query: string) =>
    `client:files:${clientId}:${query}`,
  fileDownload: (clientId: string, id: string) =>
    `client:file-dl:${clientId}:${id}`,
  conversations: (clientId: string) => `client:conversations:${clientId}`,
  messages: (clientId: string, providerId: string, page: number) =>
    `client:messages:${clientId}:${providerId}:${page}`,
  profile: (clientId: string) => `client:profile:${clientId}`,
  contacts: (clientId: string) => `client:contacts:${clientId}`,
  activities: (clientId: string, query: string) =>
    `client:activities:${clientId}:${query}`,
};
```

### Cache TTLs

```typescript
// src/client/constants/cache-ttls.ts
export const CLIENT_CACHE_TTLS = {
  DASHBOARD: 60, // 1 minute — balance data should stay fresh
  INVOICES_LIST: 120,
  INVOICE_SINGLE: 300,
  CONTRACTS_LIST: 120,
  CONTRACT_SINGLE: 300,
  FILES_LIST: 300,
  FILE_DOWNLOAD: 3600, // matches pre-signed URL validity
  CONVERSATIONS: 30, // kept short — unread counts change often
  MESSAGES: 60,
  PROFILE: 300,
  CONTACTS: 600,
  ACTIVITIES: 120,
};
```

### Messages

```typescript
// src/client/constants/messages.ts
export const CLIENT_MESSAGES = {
  AUTH: {
    SUCCESS: {
      LOGIN: 'Login successful',
      LOGOUT: 'Logged out successfully',
      TOKEN_REFRESHED: 'Token refreshed successfully',
      OTP_SENT: 'OTP sent to your email address',
      OTP_VERIFIED: 'OTP verified successfully',
      PASSWORD_RESET: 'Password reset successfully',
      PASSWORD_CHANGED: 'Password changed successfully',
    },
    ERROR: {
      INVALID_CREDENTIALS: 'Invalid email or password',
      ACCOUNT_INACTIVE:
        'Your account has been deactivated. Contact your service provider.',
      OTP_INVALID: 'The OTP you entered is incorrect',
      OTP_EXPIRED: 'The OTP has expired. Please request a new one.',
      OTP_ALREADY_USED: 'This OTP has already been used',
      RESET_TOKEN_INVALID: 'Reset token is invalid or has expired',
      SAME_PASSWORD: 'New password must be different from the current password',
      PASSWORD_MISMATCH: 'Passwords do not match',
      CURRENT_PASSWORD_WRONG: 'Current password is incorrect',
    },
  },
  INVOICE: {
    ERROR: {
      NOT_FOUND: 'Invoice not found',
      ACCESS_DENIED: 'You do not have access to this invoice',
    },
  },
  CONTRACT: {
    ERROR: {
      NOT_FOUND: 'Contract not found',
      ACCESS_DENIED: 'You do not have access to this contract',
      ALREADY_SIGNED: 'This contract has already been signed',
      SIGNATURE_REQUIRED: 'A signature is required to sign this contract',
    },
  },
  FILE: {
    ERROR: {
      NOT_FOUND: 'File not found',
      ACCESS_DENIED: 'You do not have access to this file',
    },
  },
  MESSAGE: {
    ERROR: {
      CONVERSATION_NOT_FOUND: 'Conversation not found',
      WS_UNAUTHORIZED: 'Unauthorized',
      WS_ROOM_NOT_FOUND:
        'You must join the conversation room before sending messages',
    },
  },
};
```

---

## Client Integration Test Suites

### Test Setup

```
test/client/
├── setup/
│   ├── test-app.factory.ts      ← bootstraps NestJS test module (MongoMemoryServer)
│   ├── test-redis.factory.ts    ← ioredis-mock
│   ├── test-ws.factory.ts       ← Socket.IO test client with CLIENT_JWT_SECRET handshake
│   └── seed/
│       ├── seed-client-auth.ts  ← service provider + client
│       ├── seed-invoices.ts
│       ├── seed-contracts.ts
│       ├── seed-files.ts
│       ├── seed-messages.ts
│       └── seed-activities.ts
└── modules/
    ├── auth.integration.spec.ts
    ├── dashboard.integration.spec.ts
    ├── invoices.integration.spec.ts
    ├── contracts.integration.spec.ts
    ├── files.integration.spec.ts
    ├── messages.http.integration.spec.ts
    ├── messages.gateway.integration.spec.ts
    ├── contacts.integration.spec.ts
    ├── activities.integration.spec.ts
    └── profile.integration.spec.ts
```

All test suites follow this pattern:

```typescript
describe('[Module] Client Integration Tests', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let accessToken: string;
  let seededData: SeedResult;

  beforeAll(async () => {
    app = await createClientTestApp();
    dbConnection = getConnection();
    seededData = await seedDatabase(dbConnection);
    accessToken = await loginClientAndGetToken(app, seededData.client.email);
  });

  afterAll(async () => {
    await dbConnection.dropDatabase();
    await app.close();
  });
});
```

---

### Auth Integration Tests

```typescript
describe('Auth — POST /client/api/auth/login', () => {
  it('returns 200 with tokens on valid credentials');
  it('returns accessToken, refreshToken, and client profile in data');
  it('updates client.lastLoginAt on successful login');
  it('returns 401 on wrong password');
  it('returns 401 on non-existent email');
  it('returns 403 when client.isActive is false');
  it('is case-insensitive for email');
  it('returns 400 on missing email');
  it('returns 400 on missing password');
  it('returns 400 when password is shorter than 6 characters');
  it('business-owner token is rejected by JwtClientGuard'); // decoupling assertion
});

describe('Auth — POST /client/api/auth/refresh-token', () => {
  it('returns 200 with new tokens on valid refresh token');
  it('returns 401 on expired refresh token');
  it('returns 401 on revoked refresh token');
  it('returns 401 on tampered refresh token');
  it('rotates the refresh token (old token becomes invalid after use)');
  it('returns 400 on missing refreshToken');
});

describe('Auth — POST /client/api/auth/logout', () => {
  it('returns 200 and revokes the refresh token');
  it('previously valid refresh token returns 401 after logout');
  it('returns 401 when no access token is provided');
  it('returns 400 on missing refreshToken body field');
});

describe('Auth — POST /client/api/auth/forgot-password', () => {
  it('returns 200 with expiresInSeconds on valid email');
  it('returns 200 even when email does not exist (enumeration prevention)');
  it('creates an OtpVerification record in the database');
  it('invalidates previous unused OTPs for the same email');
  it('returns 400 on invalid email format');
});

describe('Auth — POST /client/api/auth/verify-otp', () => {
  it('returns 200 with a resetToken JWT on correct OTP');
  it('returns 400 on wrong OTP');
  it('returns 400 on expired OTP');
  it('returns 400 on reused OTP');
  it('marks the OTP record as isUsed after successful verification');
  it('returns 400 on OTP shorter than 6 digits');
});

describe('Auth — POST /client/api/auth/reset-password', () => {
  it('returns 200 and updates the password hash on valid resetToken');
  it('invalidates the resetToken after first use');
  it('returns 401 on expired resetToken');
  it('returns 401 on tampered resetToken');
  it('returns 400 when passwords do not match');
  it('returns 400 when new password is same as current');
  it('revokes all active refresh tokens after reset');
});
```

---

### Dashboard Integration Tests

```typescript
describe('Dashboard — GET /client/api/dashboard', () => {
  it('returns 200 with valid dashboard data');
  it('returns 401 when unauthenticated');
  it('returns 401 when access token is expired');

  describe('outstandingBalance', () => {
    it('sums only unpaid and partial invoices for this client');
    it('returns 0 when all invoices are paid');
    it('excludes invoices belonging to other clients');
  });

  describe('totalPaid', () => {
    it('sums only paid invoices for this client');
    it('returns 0 when no invoices are paid');
  });

  describe('pendingContractsCount', () => {
    it('counts only awaiting_signature contracts for this client');
    it('returns 0 when all contracts are signed');
  });

  describe('recentActivities', () => {
    it('returns at most 10 activities');
    it('orders by date descending');
    it('only includes activities for the authenticated client');
  });

  describe('caching', () => {
    it('caches dashboard response and returns cached value on second request');
    it('cache key is scoped to clientId');
  });
});
```

---

### Invoices Integration Tests

```typescript
describe('Invoices — GET /client/api/invoices', () => {
  it('returns 200 with paginated invoices for authenticated client');
  it('returns 401 when unauthenticated');
  it('only returns invoices belonging to the authenticated client');
  it('defaults to page=1, limit=10');
  it('returns correct meta pagination object');
  it('filters by status=paid');
  it('filters by status=unpaid');
  it('filters by status=partial');
  it('filters by from date');
  it('filters by to date and date range');
  it('returns empty array when no invoices match filter');
  it('sorts by dueDate descending by default');
  it('sorts by amount ascending');
  it('sorts by issuedDate descending');
  it('paginates to page=2 correctly');
  it('returns hasNextPage=true when more pages exist');
  it('rejects limit > 100');
  it(
    'caches invoice list; different query strings produce different cache keys',
  );
});

describe('Invoices — GET /client/api/invoices/:id', () => {
  it('returns 200 with full invoice including lineItems');
  it('includes serviceProvider name and email');
  it('returns 401 when unauthenticated');
  it('returns 404 for non-existent invoice');
  it('returns 403 when invoice belongs to another client');
  it('returns 400 on invalid ObjectId format');
  it('caches single invoice response');
});
```

---

### Contracts Integration Tests

```typescript
describe('Contracts — GET /client/api/contracts', () => {
  it('returns 200 with paginated contracts');
  it('returns 401 when unauthenticated');
  it('only returns contracts for the authenticated client');
  it('filters by status=awaiting_signature');
  it('filters by status=signed');
  it('sorts by dateSent descending by default');
  it('paginates correctly');
});

describe('Contracts — GET /client/api/contracts/:id', () => {
  it('returns 200 with full contract including content text');
  it('returns 401 when unauthenticated');
  it('returns 404 for non-existent contract');
  it('returns 403 when contract belongs to another client');
  it('returns signedAt=null for unsigned contracts');
  it('returns signedAt timestamp for signed contracts');
});

describe('Contracts — PATCH /client/api/contracts/:id/sign', () => {
  it('returns 200 and updates status to signed');
  it('persists signatureData and signedAt to the database');
  it('returns 401 when unauthenticated');
  it('returns 404 for non-existent contract');
  it('returns 403 when contract belongs to another client');
  it('returns 409 when contract is already signed');
  it('returns 400 when signatureData is empty');
  it('returns 400 when signatureData is not a valid base64 image');
  it('creates an Activity record with type=contract after signing');
  it(
    'invalidates contract list cache, single contract cache, and dashboard cache',
  );
});
```

---

### Files Integration Tests

```typescript
describe('Files — GET /client/api/files', () => {
  it('returns 200 with paginated file list');
  it('returns 401 when unauthenticated');
  it('only returns files for the authenticated client');
  it('never returns storageKey in the response');
  it('filters by format=pdf');
  it('excludes soft-deleted files (isDeleted=true)');
  it('sorts by filename ascending');
  it('paginates correctly');
  it('caches the file list response');
});

describe('Files — GET /client/api/files/:id/download', () => {
  it('returns 200 with a downloadUrl and expiresInSeconds');
  it('returns 401 when unauthenticated');
  it('returns 404 for non-existent file');
  it('returns 403 when file belongs to another client');
  it('returns 404 for soft-deleted files');
  it('returned downloadUrl is a valid URL format');
  it('caches the pre-signed URL within its validity period');
});
```

---

### Messages HTTP Integration Tests

```typescript
describe('Messages HTTP — GET /client/api/messages/conversations', () => {
  it('returns 200 with all conversations for the authenticated client');
  it('returns 401 when unauthenticated');
  it('orders conversations by lastMessageAt descending');
  it('includes serviceProvider info and clientUnreadCount');
  it('returns empty array when client has no conversations');
  it('caches conversations list');
});

describe('Messages HTTP — GET /client/api/messages/conversations/:providerId', () => {
  it('returns 200 with paginated messages newest-first');
  it('returns 401 when unauthenticated');
  it(
    'returns 404 when conversation does not exist for this client+provider pair',
  );
  it('paginates correctly');
  it('caches message thread per page');
});

describe('Messages HTTP — PATCH /client/api/messages/conversations/:providerId/read', () => {
  it('returns 200 and sets clientUnreadCount to 0');
  it('marks all unread messages as isRead=true');
  it('returns 401 when unauthenticated');
  it('returns 404 when conversation does not exist');
  it('is idempotent — calling twice returns 200 both times');
  it('invalidates conversations cache after marking read');
});
```

---

### Messages WebSocket Gateway Integration Tests

```typescript
describe('ClientMessagesGateway — Connection & Auth', () => {
  it('connects with valid JWT in handshake auth');
  it('emits "connected" event with clientId on success');
  it('disconnects when no token is provided');
  it('disconnects when an expired JWT is provided');
  it('disconnects when a tampered JWT is provided');
  it('rejects a business-owner JWT (wrong audience)'); // decoupling assertion
  it('emits "error" event before disconnecting on auth failure');
});

describe('ClientMessagesGateway — join_conversation / leave_conversation', () => {
  it('client joins a conversation room successfully');
  it(
    'client in a different room does not receive messages from another conversation',
  );
  it('client stops receiving new_message events after leaving the room');
});

describe('ClientMessagesGateway — send_message', () => {
  it('saves the message and emits new_message to all room participants');
  it("emits conversation_updated to the sender's personal room");
  it('emits error when client sends without joining the room first');
  it('rejects messages exceeding 5000 characters');
  it('rejects empty content');
});

describe('ClientMessagesGateway — mark_read', () => {
  it('marks conversation as read and emits message_read to the room');
  it('resets clientUnreadCount to 0 in the database');
});

describe('ClientMessagesGateway — typing indicators', () => {
  it('emits typing={isTyping:true} to the room on typing_start');
  it('emits typing={isTyping:false} to the room on typing_stop');
  it('sender does not receive their own typing event');
});
```

---

### Contacts Integration Tests

```typescript
describe('Contacts — GET /client/api/contacts', () => {
  it('returns 200 with service providers linked to the authenticated client');
  it('returns 401 when unauthenticated');
  it('returns empty array when client has no linked provider');
  it('never returns internal fields (e.g. isActive) in the response');
});
```

---

### Activities Integration Tests

```typescript
describe('Activities — GET /client/api/activities', () => {
  it('returns 200 with paginated activity log');
  it('returns 401 when unauthenticated');
  it('only returns activities for the authenticated client');
  it('filters by type=invoice');
  it('filters by type=contract');
  it('orders by date descending');
  it('paginates correctly');
});
```

---

### Profile Integration Tests

```typescript
describe('Profile — GET /client/api/profile', () => {
  it('returns 200 with client profile including serviceProvider name');
  it('returns 401 when unauthenticated');
  it('never returns passwordHash in the response');
});

describe('Profile — PATCH /client/api/profile', () => {
  it('returns 200 with updated profile on valid fields');
  it('returns 401 when unauthenticated');
  it('only updates provided fields (partial update)');
  it('returns 400 on invalid phone number format');
  it('invalidates profile cache after update');
});

describe('Profile — PATCH /client/api/profile/change-password', () => {
  it('returns 200 on valid current + new password');
  it('returns 400 when current password is wrong');
  it('returns 400 when new and confirm passwords do not match');
  it('returns 400 when new password is same as current');
  it('returns 400 when new password is shorter than 6 characters');
  it('returns 401 when unauthenticated');
});
```

---

_Client Portal section is maintained separately from the business API. Update this section whenever the client-facing contract changes._

---

---

# Servix OS — Admin Portal API Documentation

## Table of Contents

1. [Overview](#admin-overview)
2. [Architecture: Decoupled Admin Portal](#admin-architecture)
3. [Data Models & Schemas](#admin-data-models--schemas)
4. [API Endpoints](#admin-api-endpoints)
5. [Integration Test Suites](#admin-integration-test-suites)

---

## Admin Overview

The **Servix OS Admin Portal** is an internal management API that allows Servix OS staff to:

- Authenticate with admin-specific credentials (entirely separate from business owner and client logins)
- Manage admin users, assign roles, and control access via granular permissions
- View and manage all businesses registered on the platform
- Control subscription plans and track plan change history
- Monitor AI consumption across all businesses and update query limits
- View platform-wide analytics, traffic, and system health
- Manage support tickets raised by business owners
- Access a global admin audit log of all admin actions

The admin portal operates under a **separate API namespace** (`/admin/api`) with its own JWT strategy, guards, schemas, and permission system. It never imports from business or client module services.

---

## Admin Architecture

### Decoupling Strategy

```
┌──────────────────────────────────────────────────────────────────┐
│                        NestJS Application                         │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │  Business API  │  │  Client Portal │  │  Admin Portal    │   │
│  │  /api          │  │  /client/api   │  │  /admin/api      │   │
│  │                │  │                │  │                  │   │
│  │ JwtAuthGuard   │  │ JwtClientGuard │  │ JwtAdminGuard    │   │
│  │ TenantGuard    │  │ ClientOwner-   │  │ AdminPermissions │   │
│  │ RbacGuard      │  │   shipGuard    │  │   Guard          │   │
│  │ SubscriptionG. │  │                │  │                  │   │
│  └────────────────┘  └────────────────┘  └──────────────────┘   │
│                                                                  │
│  Shared src/common/ ── guards, decorators, dto, utils, messages  │
│  Shared src/modules/ ── schemas shared; services are isolated    │
│                                                                  │
│  src/config/jwt-admin.config.ts  ← ADMIN_JWT_SECRET, separate   │
└──────────────────────────────────────────────────────────────────┘
```

**Boundary rules:**

1. `JwtAdminGuard` verifies tokens signed with `ADMIN_JWT_SECRET` and `audience: "admin"`. Tokens from the business or client flows are rejected.
2. `AdminPermissionsGuard` checks the authenticated admin's `role` against a permission key map (e.g. `users.view`, `billing.manage`). `isSystemAdmin: true` bypasses all permission checks.
3. Admin modules (`admin-*`) never import from business or client service classes. They may read shared schemas (e.g. `business.schema.ts`) but own their writes through their own services.
4. The admin auth module owns `AdminUser` and `admin-activity-log` schemas entirely — these collections are not touched by the business or client portals.

### Shared vs. Isolated

| Layer                 | Shared?          | Notes                                                                                       |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `src/common/`         | Yes              | Guards, decorators, dto, utils, messages all shared                                         |
| `src/modules/` folder | Yes              | Admin modules live alongside business/client modules                                        |
| MongoDB schemas       | Partially        | Admin reads `business.schema.ts`; owns `admin-user`, `plan-history`, `support-ticket`, etc. |
| Services              | No               | `AdminBusinessesService` is independent from `BusinessService`                              |
| Controllers           | No               | Separate route handlers under `/admin/api`                                                  |
| Guards                | No               | `JwtAdminGuard` and `AdminPermissionsGuard` are admin-only                                  |
| JWT secret            | No               | `ADMIN_JWT_SECRET` env var, separate from business and client secrets                       |
| Redis cache           | Yes (namespaced) | Admin cache keys prefixed `admin:`                                                          |

---

## Admin Data Models & Schemas

### AdminUser

```typescript
// src/modules/admin-auth/schemas/admin-user.schema.ts
import { prop, modelOptions, index } from '@typegoose/typegoose';

export enum AdminRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
}

export enum AdminStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@modelOptions({
  schemaOptions: { collection: 'admin_users', timestamps: true },
})
@index({ email: 1 }, { unique: true })
@index({ status: 1 })
@index({ role: 1 })
export class AdminUser {
  @prop({ required: true, trim: true })
  fullName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ required: true, select: false })
  passwordHash: string;

  @prop({ enum: AdminRole, default: AdminRole.EMPLOYEE })
  role: AdminRole;

  @prop({ enum: AdminStatus, default: AdminStatus.PENDING })
  status: AdminStatus;

  @prop({ trim: true })
  businessName?: string;

  @prop()
  lastActiveAt?: Date;

  @prop()
  invitedBy?: string;

  @prop({ default: false })
  isSystemAdmin: boolean; // bypasses all permission checks

  @prop({ select: false })
  otpHash?: string;

  @prop({ select: false })
  otpExpiresAt?: Date;

  @prop({ select: false, default: 0 })
  otpAttempts?: number;

  @prop({ select: false })
  refreshTokenHash?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

**MongoDB Indexes:**

```
email   UNIQUE ASC
status  ASC
role    ASC
```

---

### Business (shared schema — admin reads and writes plan/status)

```typescript
// src/modules/business/schemas/business.schema.ts
export enum BusinessPlan {
  FREE = 'Free',
  STARTER = 'Starter',
  PRO = 'Pro',
  ENTERPRISE = 'Enterprise',
}

export enum BusinessStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@modelOptions({ schemaOptions: { collection: 'businesses', timestamps: true } })
@index({ ownerEmail: 1 }, { unique: true })
@index({ status: 1 })
@index({ plan: 1 })
@index({ createdAt: -1 })
export class Business {
  @prop({ required: true, trim: true })
  businessName: string;

  @prop({ required: true, trim: true })
  ownerFullName: string;

  @prop({ required: true, lowercase: true, trim: true })
  ownerEmail: string;

  @prop({ enum: BusinessPlan, default: BusinessPlan.FREE })
  plan: BusinessPlan;

  @prop({ enum: BusinessStatus, default: BusinessStatus.PENDING })
  status: BusinessStatus;

  @prop()
  suspendedAt?: Date;

  @prop()
  suspendedBy?: string;

  @prop()
  suspendReason?: string;

  @prop({ default: 0 })
  aiQueryLimit: number;

  @prop({ default: 0 })
  aiQueriesUsedThisMonth: number;

  @prop()
  aiLimitResetAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### PlanHistory

```typescript
// src/modules/subscriptions/schemas/plan-history.schema.ts
export enum PlanChangeType {
  UPGRADE = 'upgrade',
  DOWNGRADE = 'downgrade',
  CONVERSION = 'conversion',
  CHURN = 'churn',
}

@modelOptions({
  schemaOptions: { collection: 'plan_histories', timestamps: true },
})
@index({ businessId: 1 })
@index({ createdAt: -1 })
@index({ type: 1 })
export class PlanHistory {
  @prop({ required: true })
  businessId: string;

  @prop({ required: true })
  businessName: string;

  @prop({ enum: BusinessPlan, required: true })
  fromPlan: BusinessPlan;

  @prop({ enum: BusinessPlan, required: true })
  toPlan: BusinessPlan;

  @prop({ enum: PlanChangeType, required: true })
  type: PlanChangeType;

  @prop()
  changedBy?: string;

  @prop({ trim: true })
  reason?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### AdminActivityLog

```typescript
// src/modules/admin-activity-logs/schemas/admin-activity-log.schema.ts
export enum ActivityCategory {
  USER = 'user',
  BILLING = 'billing',
  BUSINESS = 'business',
  SYSTEM = 'system',
  AI = 'ai',
}

export enum ActivityActorRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  SUPPORT = 'support',
  BILLING = 'billing',
  SYSTEM = 'system',
}

@modelOptions({
  schemaOptions: { collection: 'admin_activity_logs', timestamps: true },
})
@index({ createdAt: -1 })
@index({ actorId: 1 })
@index({ category: 1 })
@index({ targetId: 1 })
export class AdminActivityLog {
  @prop()
  actorId?: string;

  @prop({ trim: true })
  actorName?: string;

  @prop({ trim: true })
  actorEmail?: string;

  @prop({ enum: ActivityActorRole, default: ActivityActorRole.SYSTEM })
  actorRole: ActivityActorRole;

  @prop({ required: true, trim: true })
  action: string;

  @prop({ trim: true })
  targetId?: string;

  @prop({ trim: true })
  targetType?: string;

  @prop({ trim: true })
  targetLabel?: string;

  @prop({ enum: ActivityCategory, default: ActivityCategory.SYSTEM })
  category: ActivityCategory;

  @prop({ type: () => Object })
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### AiUsageLog

```typescript
// src/modules/admin-ai/schemas/ai-usage-log.schema.ts
export enum AiModel {
  CLAUDE_SONNET = 'claude-sonnet-4-6',
  CLAUDE_OPUS = 'claude-opus-4-7',
  CLAUDE_HAIKU = 'claude-haiku-4-5',
}

@modelOptions({
  schemaOptions: { collection: 'ai_usage_logs', timestamps: true },
})
@index({ businessId: 1 })
@index({ createdAt: -1 })
@index({ businessId: 1, createdAt: -1 })
@index({ model: 1 })
export class AiUsageLog {
  @prop({ required: true })
  businessId: string;

  @prop({ required: true })
  businessName: string;

  @prop({ enum: AiModel, required: true })
  model: AiModel;

  @prop({ required: true, default: 0 })
  inputTokens: number;

  @prop({ required: true, default: 0 })
  outputTokens: number;

  @prop({ required: true, default: 0 })
  totalTokens: number;

  @prop({ required: true, default: 0 })
  costUsd: number;

  @prop()
  requestId?: string;

  @prop({ required: true })
  year: number;

  @prop({ required: true })
  month: number;

  @prop({ required: true })
  day: number;

  @prop({ required: true })
  hour: number;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### AdminRole & AdminPermission

```typescript
// src/modules/admin-roles/schemas/admin-permission.schema.ts
@modelOptions({
  schemaOptions: { collection: 'admin_permissions', timestamps: true },
})
@index({ key: 1 }, { unique: true })
export class AdminPermission {
  @prop({ required: true, trim: true })
  key: string; // e.g. "users.view", "billing.manage"

  @prop({ required: true, trim: true })
  label: string;

  @prop({ trim: true })
  description?: string;

  @prop({ default: false })
  isSystem: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

```typescript
// src/modules/admin-roles/schemas/admin-role.schema.ts
@modelOptions({
  schemaOptions: { collection: 'admin_roles', timestamps: true },
})
@index({ name: 1 }, { unique: true })
export class AdminRole {
  @prop({ required: true, trim: true })
  name: string;

  @prop({ trim: true })
  description?: string;

  @prop({ type: () => [String] })
  permissionKeys: string[];

  @prop({ required: true })
  color: string;

  @prop({ default: false })
  isSystem: boolean;

  @prop({ default: 0 })
  userCount: number;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### SupportTicket

```typescript
// src/modules/support/schemas/support-ticket.schema.ts
export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TicketCategory {
  TECHNICAL = 'Technical',
  BILLING = 'Billing',
  ACCOUNT = 'Account',
  FEATURE_REQUEST = 'Feature Request',
  GENERAL = 'General',
}

export class TicketReply {
  @prop({ required: true })
  authorId: string;

  @prop({ required: true })
  authorName: string;

  @prop({ required: true })
  authorEmail: string;

  @prop({ required: true, trim: true })
  body: string;

  @prop({ default: () => new Date() })
  createdAt: Date;

  @prop({ default: false })
  isInternal: boolean;
}

@modelOptions({
  schemaOptions: { collection: 'support_tickets', timestamps: true },
})
@index({ status: 1 })
@index({ priority: 1 })
@index({ businessId: 1 })
@index({ assigneeId: 1 })
@index({ createdAt: -1 })
@index({ ticketNumber: 1 }, { unique: true })
export class SupportTicket {
  @prop({ required: true, unique: true })
  ticketNumber: string;

  @prop({ required: true, trim: true })
  subject: string;

  @prop({ required: true, trim: true })
  description: string;

  @prop({ required: true })
  requesterId: string;

  @prop({ required: true })
  requesterName: string;

  @prop({ required: true })
  requesterEmail: string;

  @prop()
  businessId?: string;

  @prop()
  businessName?: string;

  @prop({ enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @prop({ enum: TicketPriority, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @prop({ enum: TicketCategory, default: TicketCategory.GENERAL })
  category: TicketCategory;

  @prop()
  assigneeId?: string;

  @prop()
  assigneeName?: string;

  @prop({ type: () => [TicketReply] })
  replies: TicketReply[];

  @prop()
  resolvedAt?: Date;

  @prop()
  closedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
```

---

### AnalyticsSnapshot

```typescript
// src/modules/admin-analytics/schemas/analytics-snapshot.schema.ts
export class ServiceHealth {
  @prop({ required: true })
  name: string;

  @prop({ required: true })
  uptime: number;

  @prop({ required: true })
  responseTimeMs: number;

  @prop({ required: true })
  status: 'operational' | 'degraded' | 'down';
}

export class HourlyTraffic {
  @prop({ required: true })
  hour: number;

  @prop({ required: true })
  requests: number;
}

@modelOptions({
  schemaOptions: { collection: 'analytics_snapshots', timestamps: true },
})
@index({ snapshotDate: -1 }, { unique: true })
export class AnalyticsSnapshot {
  @prop({ required: true })
  snapshotDate: Date;

  @prop({ type: () => [HourlyTraffic] })
  hourlyTraffic: HourlyTraffic[];

  @prop({ type: () => [ServiceHealth] })
  systemHealth: ServiceHealth[];

  @prop({ default: 0 })
  websiteBuilderUsers: number;

  @prop({ default: 0 })
  bookingSystemUsers: number;

  @prop({ default: 0 })
  aiAssistantUsers: number;

  @prop({ default: 0 })
  paymentGatewayUsers: number;

  @prop({ default: 0 })
  websitesPublished: number;

  @prop({ default: 0 })
  websitesPublishedChange: number;

  createdAt: Date;
  updatedAt: Date;
}
```

---

## Admin API Endpoints

### Base URL: `/admin/api`

All protected routes require: `Authorization: Bearer <access_token>`

The `JwtAdminGuard` validates tokens signed with `ADMIN_JWT_SECRET` and `audience: "admin"`. Business and client tokens are rejected. `isSystemAdmin: true` on the admin user bypasses `AdminPermissionsGuard` on all routes.

---

### Auth Module — `/admin/api/auth`

All auth endpoints are public (no JWT required).

#### `POST /auth/login`

**Request Body:**

```json
{ "email": "jane@servixos.com", "password": "securepassword" }
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 3600,
    "admin": {
      "id": "6641...",
      "fullName": "Jane Doe",
      "email": "jane@servixos.com",
      "role": "admin",
      "status": "active",
      "businessName": "Servix OS"
    }
  },
  "timestamp": "..."
}
```

**Errors:** `401` Invalid credentials · `403` Account suspended · `403` Account pending

> Access token TTL: 1 hour. Refresh token TTL: 7 days. Refresh token hash stored in `AdminUser.refreshTokenHash`.

---

#### `POST /auth/refresh`

**Request Body:** `{ "refreshToken": "eyJ..." }`

**Response `200`:** New access + refresh tokens (same shape as login `data`, without `admin`).

**Errors:** `401` Token invalid/expired

---

#### `POST /auth/forgot-password`

**Request Body:** `{ "email": "jane@servixos.com" }`

**Response `200`:** `{ "success": true, "message": "OTP sent to your email address", "data": null }`

> Always returns `200` even if the email does not exist. OTP expires in 10 minutes. Stored as `otpHash` on `AdminUser`.

---

#### `POST /auth/verify-otp`

**Request Body:** `{ "email": "jane@servixos.com", "otp": "483920" }`

**Response `200`:**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": { "resetToken": "<signed-jwt-valid-15-min>" }
}
```

**Errors:** `400` OTP invalid · `400` Max OTP attempts reached (5)

---

#### `POST /auth/reset-password`

**Request Body:**

```json
{
  "resetToken": "<jwt>",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Response `200`:** `{ "success": true, "message": "Password reset successfully", "data": null }`

**Errors:** `400` Passwords mismatch · `400` Password too short (min 8) · `401` Reset token invalid/expired

---

#### `POST /auth/logout`

Requires auth. Clears `refreshTokenHash` on `AdminUser`.

**Response `200`:** `{ "success": true, "message": "Logged out successfully", "data": null }`

---

### Users Module — `/admin/api/users`

**Required permission:** `users.view` (GET) · `users.manage` (POST / PATCH)

#### `GET /users`

**Query Parameters:**

| Param       | Type                                             | Default                                  |
| ----------- | ------------------------------------------------ | ---------------------------------------- |
| `page`      | `number`                                         | `1`                                      |
| `limit`     | `number` (max 100)                               | `20`                                     |
| `search`    | `string`                                         | — searches fullName, email, businessName |
| `status`    | `active \| suspended \| pending`                 | —                                        |
| `role`      | `owner \| admin \| manager \| employee`          | —                                        |
| `sortBy`    | `fullName \| email \| lastActiveAt \| createdAt` | `createdAt`                              |
| `sortOrder` | `asc \| desc`                                    | `desc`                                   |

**Response `200`:** Paginated `AdminUser[]`. `passwordHash` never returned.

---

#### `GET /users/:id`

**Response `200`:** Single `AdminUser`. **Errors:** `404` Not found

---

#### `POST /users`

**Request Body:**

```json
{
  "fullName": "Jane Doe",
  "email": "jane@servixos.com",
  "businessName": "Servix OS",
  "role": "admin"
}
```

Creates user with `status: "pending"` and sends invitation email with a one-time setup link.

**Response `201`:** Created `AdminUser`. **Errors:** `409` Email already exists

---

#### `PATCH /users/:id`

**Request Body:** `{ "fullName"?, "role"?, "businessName"? }` (all optional)

**Response `200`:** Updated `AdminUser`. **Errors:** `404` Not found

---

#### `PATCH /users/:id/status`

**Request Body:** `{ "status": "suspended" | "active", "reason"? }`

**Response `200`:** Updated status message. **Errors:** `404` Not found · `403` Cannot suspend own account

**Side effects:** Creates `AdminActivityLog` entry.

---

#### `POST /users/:id/reset-password`

Sends a password reset email to the specified user.

**Response `200`:** `{ "message": "Password reset link sent successfully" }` **Errors:** `404` Not found

---

#### `POST /users/bulk-email`

**Request Body:** `{ "userIds": ["..."], "subject": "...", "body": "..." }`

**Response `200`:** `{ "data": { "sent": 12, "failed": 0 } }`

---

### Businesses Module — `/admin/api/businesses`

**Required permission:** `businesses.view` (GET) · `businesses.manage` (PATCH)

#### `GET /businesses`

**Query Parameters:**

| Param       | Type                                   | Default                                            |
| ----------- | -------------------------------------- | -------------------------------------------------- |
| `page`      | `number`                               | `1`                                                |
| `limit`     | `number`                               | `20`                                               |
| `search`    | `string`                               | — searches businessName, ownerEmail, ownerFullName |
| `status`    | `active \| suspended \| pending`       | —                                                  |
| `plan`      | `Free \| Starter \| Pro \| Enterprise` | —                                                  |
| `sortBy`    | `businessName \| createdAt \| plan`    | `createdAt`                                        |
| `sortOrder` | `asc \| desc`                          | `desc`                                             |

**Response `200`:** Paginated `Business[]`.

---

#### `GET /businesses/:id`

**Response `200`:** Single `Business`. **Errors:** `404` Not found

---

#### `PATCH /businesses/:id`

**Request Body:** `{ "plan"?, "businessName"?, "aiQueryLimit"? }` (all optional)

**Response `200`:** Updated `Business`.

---

#### `PATCH /businesses/:id/status`

**Request Body:** `{ "status": "suspended" | "active", "reason"? }`

**Response `200`:** Suspended / reactivated message.

**Errors:** `404` Not found · `400` Already suspended · `400` Already active

**Side effects:** Creates `AdminActivityLog` entry.

---

#### `POST /businesses/bulk-email`

**Request Body:** `{ "businessIds": ["..."], "subject": "...", "body": "..." }`

**Response `200`:** `{ "data": { "sent": 8, "failed": 0 } }`

---

### Subscriptions Module — `/admin/api/subscriptions`

**Required permission:** `billing.view` (GET) · `billing.manage` (PATCH)

#### `GET /subscriptions/stats`

**Response `200`:**

```json
{
  "data": {
    "totalSubscribers": 248,
    "mrrUsd": 18640,
    "mrrChangePercent": 12.4,
    "planDistribution": {
      "Free": 80,
      "Starter": 90,
      "Pro": 60,
      "Enterprise": 18
    },
    "churnRatePercent": 2.1,
    "conversionRatePercent": 8.7
  }
}
```

---

#### `GET /subscriptions/recent-changes`

**Query Parameters:** `page`, `limit`, `type` (`upgrade | downgrade | conversion | churn`)

**Response `200`:** Paginated `PlanHistory[]`.

---

#### `PATCH /subscriptions/:businessId/plan`

**Request Body:** `{ "plan": "Pro", "reason"? }`

**Response `200`:** Updated `Business`.

**Errors:** `404` Business not found · `400` Same plan · `400` Invalid plan

**Side effects:** Creates `PlanHistory` record. Invalidates business caches.

---

### Activity Logs Module — `/admin/api/activity-logs`

**Required permission:** `logs.view`

#### `GET /activity-logs`

**Query Parameters:**

| Param       | Type                                               | Default                                               |
| ----------- | -------------------------------------------------- | ----------------------------------------------------- |
| `page`      | `number`                                           | `1`                                                   |
| `limit`     | `number`                                           | `20`                                                  |
| `search`    | `string`                                           | — searches action, actorName, actorEmail, targetLabel |
| `category`  | `user \| billing \| business \| system \| ai`      | —                                                     |
| `actorRole` | `admin \| manager \| support \| billing \| system` | —                                                     |
| `from`      | `ISO date`                                         | —                                                     |
| `to`        | `ISO date`                                         | —                                                     |
| `sortOrder` | `asc \| desc`                                      | `desc`                                                |

**Response `200`:** Paginated `AdminActivityLog[]`.

---

#### `GET /activity-logs/stats`

**Response `200`:**

```json
{
  "data": {
    "total": 1420,
    "byCategory": {
      "user": 380,
      "billing": 210,
      "business": 450,
      "system": 280,
      "ai": 100
    },
    "todayCount": 34
  }
}
```

---

### AI Consumption Module — `/admin/api/ai`

**Required permission:** `ai.manage`

#### `GET /ai/consumption`

**Query Parameters:** `year` (default: current), `month` (default: current, 1–12)

**Response `200`:**

```json
{
  "data": {
    "totalQueries": 142800,
    "totalTokens": 8420000,
    "totalCostUsd": 2184.4,
    "queriesChangePercent": 18.3,
    "dailyBreakdown": [{ "day": 1, "queries": 4200, "costUsd": 68.4 }]
  }
}
```

---

#### `GET /ai/consumption/by-business`

**Query Parameters:** `page`, `limit`, `status` (`normal | warning | exceeded`), `search`

**Response `200`:**

```json
{
  "data": [
    {
      "businessId": "...",
      "businessName": "Acme Corp",
      "plan": "Pro",
      "queriesUsed": 4200,
      "queryLimit": 5000,
      "usagePercent": 84,
      "costEstimateUsd": 63.0,
      "status": "warning"
    }
  ]
}
```

> `status` rules: `normal` < 80% · `warning` >= 80% · `exceeded` >= 100%

---

#### `GET /ai/models`

**Response `200`:**

```json
{
  "data": [
    {
      "model": "claude-sonnet-4-6",
      "queries": 62000,
      "percent": 43.4,
      "costUsd": 940.0
    }
  ]
}
```

---

#### `PATCH /ai/:businessId/limits`

**Request Body:** `{ "queryLimit": 5000 }` (0 = unlimited)

**Response `200`:** Updated `Business`. **Errors:** `404` Not found · `400` Negative limit

---

### Analytics Module — `/admin/api/analytics`

**Required permission:** `analytics.view`

#### `GET /analytics/traffic`

**Query Parameters:** `date` (ISO date string, default: today UTC)

**Response `200`:**

```json
{
  "data": {
    "date": "2026-04-14",
    "hourlyData": [{ "hour": 0, "requests": 142 }],
    "totalRequests": 38420,
    "peakHour": 14,
    "peakRequests": 3200
  }
}
```

---

#### `GET /analytics/system-health`

**Response `200`:**

```json
{
  "data": [
    {
      "name": "API Gateway",
      "uptime": 99.98,
      "responseTimeMs": 42,
      "status": "operational"
    },
    {
      "name": "Database",
      "uptime": 99.95,
      "responseTimeMs": 12,
      "status": "operational"
    }
  ]
}
```

---

#### `GET /analytics/feature-adoption`

**Response `200`:**

```json
{
  "data": [
    { "feature": "Website Builder", "activeUsers": 1820, "percent": 73 },
    { "feature": "AI Assistant", "activeUsers": 980, "percent": 39 }
  ]
}
```

---

#### `GET /analytics/websites-published`

**Response `200`:**

```json
{ "data": { "total": 3842, "changePercent": 14.2, "recentPublished": 124 } }
```

---

### Roles & Permissions Module — `/admin/api/roles`, `/admin/api/permissions`

**Required permission:** `roles.manage`

#### `GET /roles`

**Response `200`:** `AdminRole[]` with `permissionKeys` array.

#### `GET /roles/:id`

**Response `200`:** Single `AdminRole`. **Errors:** `404` Not found

#### `POST /roles`

**Request Body:**

```json
{
  "name": "Support",
  "description": "...",
  "permissionKeys": ["users.view"],
  "color": "#4F46E5"
}
```

**Response `201`:** Created `AdminRole`. **Errors:** `409` Name taken · `400` Empty permissionKeys

#### `PATCH /roles/:id`

All fields optional. **Response `200`:** Updated `AdminRole`. **Errors:** `404` · `409` Name conflict

#### `DELETE /roles/:id`

**Response `200`:** `{ "message": "Role deleted successfully" }`

**Errors:** `404` Not found · `400` Has assigned users · `400` Cannot delete system role

#### `GET /permissions`

**Response `200`:** All `AdminPermission[]`. Cached for 1 hour.

---

### Team Module — `/admin/api/team`

**Required:** any authenticated admin.

#### `GET /team`

**Response `200`:** Active admin team members (excludes suspended and pending).

```json
{
  "data": [
    {
      "id": "...",
      "fullName": "Jane Doe",
      "email": "jane@servixos.com",
      "role": "admin",
      "status": "active"
    }
  ]
}
```

---

### Support Tickets Module — `/admin/api/support/tickets`

**Required permission:** any authenticated admin (read) · `users.manage` for mutations

#### `GET /support/tickets`

**Query Parameters:**

| Param           | Type                                                          |
| --------------- | ------------------------------------------------------------- |
| `page`, `limit` | `number`                                                      |
| `search`        | searches subject, requesterName, requesterEmail, businessName |
| `status`        | `open \| in_progress \| resolved \| closed`                   |
| `priority`      | `low \| medium \| high \| urgent`                             |
| `category`      | `TicketCategory` enum                                         |
| `assigneeId`    | filter by assigned admin                                      |
| `from`, `to`    | ISO date range                                                |
| `sortBy`        | `createdAt \| updatedAt \| priority`                          |
| `sortOrder`     | `asc \| desc`                                                 |

**Response `200`:** Paginated `SupportTicket[]`.

---

#### `GET /support/tickets/stats`

**Response `200`:**

```json
{
  "data": {
    "open": 24,
    "in_progress": 12,
    "resolved": 88,
    "closed": 340,
    "total": 464,
    "urgentOpen": 3
  }
}
```

---

#### `GET /support/tickets/:id`

**Response `200`:** Single `SupportTicket` with full `replies` array. **Errors:** `404` Not found

---

#### `PATCH /support/tickets/:id/status`

**Request Body:** `{ "status": "in_progress" }`

**Valid transitions:** `open → in_progress → resolved → closed` · `open → closed` · `resolved → closed`

**Errors:** `400` Invalid transition · `400` Already closed · `404` Not found

**Side effects:** Sets `resolvedAt` / `closedAt`. Creates `AdminActivityLog` entry.

---

#### `PATCH /support/tickets/:id/assignee`

**Request Body:** `{ "assigneeId": "..." }` (null to unassign)

**Response `200`:** Updated `SupportTicket`. **Errors:** `404` Not found / Assignee not found

---

#### `POST /support/tickets/:id/reply`

**Request Body:** `{ "body": "...", "isInternal"?: false }`

**Response `201`:** Updated `SupportTicket`. **Errors:** `404` Not found · `400` Ticket already closed

**Side effects:** Creates `AdminActivityLog` entry.

---

### Dashboard Module — `/admin/api/dashboard`

**Required permission:** `analytics.view`

#### `GET /dashboard/stats`

**Response `200`:**

```json
{
  "data": {
    "totalUsers": {
      "value": 2481,
      "change": "+12.4%",
      "changeType": "up",
      "previousValue": 2208
    },
    "monthlyRevenue": {
      "value": 18640,
      "change": "+8.2%",
      "changeType": "up",
      "currency": "USD"
    },
    "activeBusinesses": { "value": 248, "change": "+5.1%", "changeType": "up" },
    "aiQueriesToday": { "value": 4280, "change": "-2.3%", "changeType": "down" }
  }
}
```

**Cache:** 1 minute TTL.

---

#### `GET /dashboard/revenue-chart`

**Query Parameters:** `months` (default: 6, max: 24)

**Response `200`:**

```json
{
  "data": [
    { "month": "Nov", "year": 2025, "revenueUsd": 14200, "growthPercent": 6.2 },
    { "month": "Dec", "year": 2025, "revenueUsd": 15800, "growthPercent": 11.3 }
  ]
}
```

**Cache:** 5 minute TTL.

---

#### `GET /dashboard/recent-activities`

**Query Parameters:** `limit` (default: 10, max: 50)

**Response `200`:** Latest `AdminActivityLog[]` sorted newest first.

**Cache:** 30 second TTL.

---

## Admin Cache Keys

```typescript
// src/common/constants/cache-ttl.constants.ts (additions)
export const ADMIN_CACHE_KEYS = {
  userList: 'admin:users:list',
  userDetail: (id: string) => `admin:users:${id}`,
  businessList: 'admin:businesses:list',
  businessDetail: (id: string) => `admin:businesses:${id}`,
  subscriptionStats: 'admin:subscriptions:stats',
  subscriptionChanges: 'admin:subscriptions:changes',
  activityLogList: 'admin:activity-logs:list',
  activityLogStats: 'admin:activity-logs:stats',
  aiConsumptionOverview: (year: number, month: number) =>
    `admin:ai:overview:${year}:${month}`,
  aiConsumptionByBusiness: 'admin:ai:by-business',
  aiModelDistribution: 'admin:ai:models',
  analyticsTraffic: (date: string) => `admin:analytics:traffic:${date}`,
  analyticsHealth: 'admin:analytics:health',
  analyticsFeatureAdoption: 'admin:analytics:features',
  analyticsWebsites: 'admin:analytics:websites',
  roleList: 'admin:roles:list',
  permissionList: 'admin:permissions:list',
  teamList: 'admin:team:list',
  ticketList: 'admin:tickets:list',
  ticketStats: 'admin:tickets:stats',
  ticketDetail: (id: string) => `admin:tickets:${id}`,
  dashboardStats: 'admin:dashboard:stats',
  dashboardRevenue: 'admin:dashboard:revenue',
  dashboardActivities: 'admin:dashboard:activities',
};
```

---

## Admin Integration Test Suites

### Test Setup

```
test/admin/
├── setup/
│   ├── test-app.factory.ts      ← MongoMemoryServer + ioredis-mock
│   └── seed/
│       ├── seed-admin-auth.ts   ← admin users at various roles/statuses
│       ├── seed-businesses.ts
│       ├── seed-plan-history.ts
│       ├── seed-tickets.ts
│       ├── seed-activity-logs.ts
│       └── seed-ai-usage.ts
└── modules/
    ├── auth.integration.spec.ts
    ├── users.integration.spec.ts
    ├── businesses.integration.spec.ts
    ├── subscriptions.integration.spec.ts
    ├── activity-logs.integration.spec.ts
    ├── ai-consumption.integration.spec.ts
    ├── analytics.integration.spec.ts
    ├── roles.integration.spec.ts
    ├── support.integration.spec.ts
    ├── dashboard.integration.spec.ts
    ├── cache.integration.spec.ts
    └── rbac.integration.spec.ts
```

---

### Auth Integration Tests

```typescript
describe('Admin Auth — POST /admin/api/auth/login', () => {
  it('returns 200 with tokens and admin profile on valid credentials');
  it('updates lastActiveAt on successful login');
  it('returns 401 for wrong password');
  it('returns 401 for non-existent email');
  it('returns 403 for suspended admin account');
  it('returns 403 for pending admin account');
  it('returns 400 for invalid email format');
  it('returns 400 for missing password');
  it('business-owner token is rejected by JwtAdminGuard'); // decoupling assertion
  it('client portal token is rejected by JwtAdminGuard'); // decoupling assertion
});

describe('Admin Auth — POST /admin/api/auth/refresh', () => {
  it('returns new access token with valid refresh token');
  it('returns 401 for expired refresh token');
  it('returns 401 for tampered refresh token');
  it('returns 401 after logout invalidates refresh token');
});

describe('Admin Auth — POST /admin/api/auth/forgot-password', () => {
  it('returns 200 even when email does not exist (no enumeration)');
  it('stores otpHash and otpExpiresAt on AdminUser');
  it('OTP expires after 10 minutes');
});

describe('Admin Auth — POST /admin/api/auth/verify-otp', () => {
  it('returns resetToken JWT for valid OTP');
  it('returns 400 for incorrect OTP');
  it('returns 400 after 5 failed attempts');
  it('returns 400 for expired OTP');
});

describe('Admin Auth — POST /admin/api/auth/reset-password', () => {
  it('updates passwordHash on valid resetToken');
  it('returns 401 for expired resetToken');
  it('returns 400 when passwords do not match');
  it('returns 400 for password shorter than 8 characters');
  it('clears refreshTokenHash after reset');
});

describe('Admin Auth — POST /admin/api/auth/logout', () => {
  it('returns 200 and clears refreshTokenHash');
  it('returns 401 when unauthenticated');
});
```

---

### Users Integration Tests

```typescript
describe('Admin Users — GET /admin/api/users', () => {
  it('returns paginated user list for admin with users.view permission');
  it('returns 401 when unauthenticated');
  it('returns 403 without users.view permission');
  it('filters by status=active');
  it('filters by role=manager');
  it('searches by fullName case-insensitively');
  it('searches by email substring');
  it('returns correct pagination meta');
  it('rejects limit > 100');
  it('never exposes passwordHash in response');
});

describe('Admin Users — POST /admin/api/users', () => {
  it('creates user with status=pending and sends invite email');
  it('returns 409 if email already exists');
  it('returns 400 for invalid role enum');
  it('returns 403 without users.manage permission');
  it('creates AdminActivityLog entry on success');
});

describe('Admin Users — PATCH /admin/api/users/:id/status', () => {
  it('suspends active user');
  it('reactivates suspended user');
  it('returns 403 when attempting to suspend own account');
  it('creates AdminActivityLog entry for suspension');
  it('creates AdminActivityLog entry for reactivation');
});

describe('Admin Users — POST /admin/api/users/bulk-email', () => {
  it('sends emails to all specified users');
  it('returns 400 if userIds array is empty');
  it('skips non-existent user IDs gracefully');
});
```

---

### Businesses Integration Tests

```typescript
describe('Admin Businesses — GET /admin/api/businesses', () => {
  it('returns paginated business list');
  it('filters by status=suspended');
  it('filters by plan=Pro');
  it('searches by businessName');
  it('searches by ownerEmail');
  it('returns 403 without businesses.view permission');
});

describe('Admin Businesses — PATCH /admin/api/businesses/:id/status', () => {
  it('suspends active business');
  it('returns 400 for already-suspended business');
  it('reactivates suspended business');
  it('returns 400 for already-active business');
  it('creates AdminActivityLog on suspend/reactivate');
});

describe('Admin Businesses — POST /admin/api/businesses/bulk-email', () => {
  it('sends bulk email to business owners');
  it('returns 400 for empty businessIds array');
});
```

---

### Subscriptions Integration Tests

```typescript
describe('Admin Subscriptions — GET /admin/api/subscriptions/stats', () => {
  it('returns MRR and plan distribution');
  it('MRR calculation is correct given seeded data');
  it('returns 403 without billing.view permission');
});

describe('Admin Subscriptions — PATCH /admin/api/subscriptions/:businessId/plan', () => {
  it('upgrades Starter → Pro and creates PlanHistory record with type=upgrade');
  it('downgrades Pro → Starter and records type=downgrade');
  it('returns 400 when plan is the same as current');
  it('returns 404 for non-existent businessId');
  it('returns 403 without billing.manage permission');
  it('invalidates business list and detail cache on plan change');
});
```

---

### Activity Logs Integration Tests

```typescript
describe('Admin Activity Logs — GET /admin/api/activity-logs', () => {
  it('returns paginated admin activity logs');
  it('filters by category=billing');
  it('filters by actorRole=admin');
  it('filters by date range (from/to)');
  it('searches by action field');
  it('returns logs sorted by createdAt desc by default');
  it('returns 403 without logs.view permission');
});

describe('Admin Activity Logs — GET /admin/api/activity-logs/stats', () => {
  it('returns correct counts per category');
  it("todayCount reflects only today's entries");
});
```

---

### AI Consumption Integration Tests

```typescript
describe('Admin AI — GET /admin/api/ai/consumption', () => {
  it('returns aggregated overview for current month');
  it('filters by year/month query params');
  it('totalCostUsd is sum of all AiUsageLog.costUsd for the period');
  it('dailyBreakdown has one entry per day with recorded usage');
  it('returns 403 without ai.manage permission');
});

describe('Admin AI — GET /admin/api/ai/consumption/by-business', () => {
  it('returns per-business aggregated usage');
  it('status=warning when usagePercent >= 80');
  it('status=exceeded when usagePercent >= 100');
  it('status=normal when usagePercent < 80');
  it('filters by status=warning');
});

describe('Admin AI — PATCH /admin/api/ai/:businessId/limits', () => {
  it('updates aiQueryLimit on the Business document');
  it('accepts 0 for unlimited');
  it('returns 400 for negative limit');
  it('returns 404 for non-existent businessId');
});
```

---

### Analytics Integration Tests

```typescript
describe('Admin Analytics — GET /admin/api/analytics/traffic', () => {
  it('returns 24-entry hourlyData array for a given date');
  it('totalRequests equals sum of hourly values');
  it('peakHour is the hour with the highest requests');
  it('defaults to today when no date param');
  it('returns 400 for invalid date format');
  it('returns 403 without analytics.view permission');
});

describe('Admin Analytics — GET /admin/api/analytics/system-health', () => {
  it('returns array of service health objects');
  it('each entry has name, uptime, responseTimeMs, status');
});

describe('Admin Analytics — GET /admin/api/analytics/feature-adoption', () => {
  it('returns feature list with activeUsers and percent');
});

describe('Admin Analytics — GET /admin/api/analytics/websites-published', () => {
  it('returns total and changePercent');
});
```

---

### Roles Integration Tests

```typescript
describe('Admin Roles — POST /admin/api/roles', () => {
  it('creates role with name, description, permissionKeys, color');
  it('returns 409 for duplicate role name');
  it('returns 400 for empty permissionKeys');
  it('returns 400 for invalid hex color');
  it('userCount starts at 0');
});

describe('Admin Roles — DELETE /admin/api/roles/:id', () => {
  it('deletes a role with no assigned users');
  it('returns 400 when role has assigned users');
  it('returns 400 for system roles');
  it('returns 404 for non-existent role');
});

describe('Admin Roles — GET /admin/api/permissions', () => {
  it('returns all permission records');
  it('response is served from cache on second request');
});

describe('Admin Team — GET /admin/api/team', () => {
  it('returns only active admin team members');
  it('excludes suspended and pending members');
});
```

---

### Support Tickets Integration Tests

```typescript
describe('Admin Support — PATCH /admin/api/support/tickets/:id/status', () => {
  it('transitions open → in_progress');
  it('transitions in_progress → resolved and sets resolvedAt');
  it('transitions resolved → closed and sets closedAt');
  it('transitions open → closed directly');
  it('returns 400 for invalid transition (e.g. closed → open)');
  it('returns 400 for already-closed ticket');
  it('creates AdminActivityLog on status change');
});

describe('Admin Support — POST /admin/api/support/tickets/:id/reply', () => {
  it('adds reply to replies array');
  it('sets isInternal=true for internal notes');
  it('returns 400 for empty body');
  it('returns 400 for closed ticket');
  it('creates AdminActivityLog on reply');
});

describe('Admin Support — GET /admin/api/support/tickets/stats', () => {
  it('counts are accurate for each status');
  it('urgentOpen only counts priority=urgent AND status=open tickets');
});
```

---

### Dashboard Integration Tests

```typescript
describe('Admin Dashboard — GET /admin/api/dashboard/stats', () => {
  it('returns all four metric cards');
  it('activeBusinesses matches count of businesses with status=active');
  it('changeType is "up" when current > previous');
  it('changeType is "down" when current < previous');
  it('returns 403 without analytics.view permission');
});

describe('Admin Dashboard — GET /admin/api/dashboard/revenue-chart', () => {
  it('returns N months of data when months param is provided');
  it('defaults to 6 months');
  it('rejects months > 24');
});

describe('Admin Dashboard — GET /admin/api/dashboard/recent-activities', () => {
  it('returns up to limit AdminActivityLog entries');
  it('defaults to 10 entries');
  it('rejects limit > 50');
  it('entries are sorted newest first');
});
```

---

### Cache Integration Tests

```typescript
describe('Admin Cache — invalidation', () => {
  it('admin:users:list invalidated after POST /admin/api/users');
  it('admin:users:list invalidated after PATCH /admin/api/users/:id/status');
  it(
    'admin:businesses:list invalidated after PATCH /admin/api/businesses/:id/status',
  );
  it('admin:businesses:<id> invalidated after PATCH /admin/api/businesses/:id');
  it('admin:roles:list invalidated after POST /admin/api/roles');
  it('admin:roles:list invalidated after DELETE /admin/api/roles/:id');
  it(
    'admin:tickets:list invalidated after PATCH /admin/api/support/tickets/:id/status',
  );
});

describe('Admin Cache — hits', () => {
  it('second GET /admin/api/permissions hits Redis (no DB query)');
  it('second GET /admin/api/dashboard/stats hits Redis within TTL window');
  it('admin:analytics:health expires after 30 seconds (mocked time)');
});
```

---

### RBAC Integration Tests

```typescript
describe('Admin RBAC — JwtAdminGuard', () => {
  it('returns 401 on all protected routes without token');
  it('returns 401 for expired token');
  it('returns 401 for business-owner token (wrong audience)');
  it('returns 401 for client portal token (wrong audience)');
  it('returns 200 for valid admin token');
});

describe('Admin RBAC — AdminPermissionsGuard', () => {
  it('admin with users.view can GET /admin/api/users');
  it('admin without users.view gets 403 on GET /admin/api/users');
  it('admin with billing.manage can PATCH /admin/api/subscriptions/:id/plan');
  it(
    'admin without billing.manage gets 403 on PATCH /admin/api/subscriptions/:id/plan',
  );
  it('isSystemAdmin bypasses all permission checks');
  it('suspended admin gets 403 on all protected routes');
});
```

---

_Admin Portal section is maintained separately from the business and client APIs. Update this section whenever the admin-facing contract changes._
