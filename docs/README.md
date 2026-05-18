# ServixOS API — Frontend Integration Docs

This directory contains module-by-module API documentation for the ServixOS frontend team.

---

## Portals

| Portal | Route prefix | Auth type |
|---|---|---|
| Business (owner / employees) | `/api/...` | JWT (`aud: business`) + `X-Business-Id` header |
| Client | `/api/client/api/...` | JWT (`aud: client`) |
| Auth (public) | `/api/auth`, `/api/client-auth` | None (but HMAC signing required) |

---

## Common Request Requirements

Every request must carry HMAC signature headers (except the `client-token` endpoint):

| Header | Description |
|---|---|
| `x-timestamp` | Unix timestamp in milliseconds |
| `x-signature` | HMAC-SHA256 of `timestamp + method + path + rawBody` using the shared `API_KEY` |

Business-portal protected endpoints additionally require:

| Header | Description |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the authenticated business |

---

## Standard Response Envelope

All responses follow this shape:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable message",
  "data": { ... }
}
```

List endpoints additionally include:

```json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

Some list endpoints include a `statistics` top-level key with aggregate counts/totals.

---

## Modules

| File | Module |
|---|---|
| [api-auth.md](./api-auth.md) | Business login, onboarding, PIN, password reset |
| [api-client-auth.md](./api-client-auth.md) | Client portal login & auth |
| [api-client-websocket.md](./api-client-websocket.md) | Client portal realtime messaging via WebSocket |
| [api-clients.md](./api-clients.md) | Client management |
| [api-requests.md](./api-requests.md) | Service requests (inbound enquiries) |
| [api-jobs.md](./api-jobs.md) | Job scheduling, start/complete, contracts |
| [api-invoices.md](./api-invoices.md) | Invoice creation, PDF, send |
| [api-payments.md](./api-payments.md) | Payment recording |
| [api-messaging.md](./api-messaging.md) | REST + WebSocket chat — business ↔ client (both portals) |
| [api-team-messaging.md](./api-team-messaging.md) | Internal team message feed |
| [api-announcements.md](./api-announcements.md) | Business-wide staff announcements |
| [api-contracts.md](./api-contracts.md) | Contract creation, PDF, send, sign (both portals) |
| [api-files.md](./api-files.md) | Client file uploads and downloads (both portals) |
| [api-schedules.md](./api-schedules.md) | Employee shift scheduling |
| [api-tasks.md](./api-tasks.md) | Task management, subtasks, comments, activity log |
| [api-activity-logs.md](./api-activity-logs.md) | Audit trail |
| [api-roles-permissions.md](./api-roles-permissions.md) | Role CRUD + permission reference |
| [api-employees.md](./api-employees.md) | Employee management + time tracking |
| [api-export.md](./api-export.md) | Client data export |
| [api-reviews.md](./api-reviews.md) | Job reviews — submit, retrieve, stats (both portals) |

---

## Error Handling

All errors follow the same envelope shape with `success: false`:

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Client not found"
}
```

Common HTTP status codes used:

| Code | Meaning |
|---|---|
| 400 | Bad request / validation error |
| 401 | Missing or invalid token |
| 403 | Forbidden (insufficient permissions) |
| 404 | Resource not found |
| 409 | Conflict (duplicate resource) |
| 422 | Unprocessable entity |
| 500 | Internal server error |

---

## Pagination Defaults

| Parameter | Default | Max |
|---|---|---|
| `page` | `1` | — |
| `limit` | `20` | `50` (most modules), `100` (messages, logs) |
