# ServixOS Admin Portal — API Reference

**Base URL:** `https://api.servixos.com` (or `http://localhost:3000` locally)

All admin routes are prefixed `/api/admin/api/`. All responses follow the standard envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable message",
  "data": { ... }
}
```

Error responses follow the same shape with `success: false` and an appropriate `statusCode`.

---

## Authentication

All admin endpoints except login, verify-OTP, and refresh require a **Bearer token** in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

There are two login flows depending on how the admin account was created:

### Flow A — Default (seeded) admin

```
POST /login → { accessToken, refreshToken, mustChangePassword: true }
  └─ if mustChangePassword: force POST /change-password before other actions
```

### Flow B — Invited admin (OTP required on every login)

```
POST /login → { requiresOtp: true, otpToken }
  └─ POST /verify-otp (otpToken + 6-digit OTP from email) → { accessToken, refreshToken }
```

---

### POST `/api/admin/api/auth/login`

Validate credentials and start a session.

**Auth required:** No

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Admin email address |
| `password` | string | Yes | Account password |

**Response — standard admin (Flow A):**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "abc123...",
    "mustChangePassword": true,
    "admin": {
      "id": "6649...",
      "firstName": "Super",
      "lastName": "Admin",
      "email": "admin@servixos.com"
    }
  }
}
```

**Response — invited admin (Flow B):**

```json
{
  "data": {
    "requiresOtp": true,
    "otpToken": "eyJ..."
  }
}
```

**Errors:**

| Code | Reason |
|---|---|
| `401` | Email not found, account inactive, or wrong password |

---

### POST `/api/admin/api/auth/verify-otp`

Complete login for invited admins by submitting the emailed OTP. The OTP expires in **10 minutes**.

**Auth required:** No

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `otpToken` | string | Yes | The `otpToken` returned by `POST /login` |
| `otp` | string | Yes | 6-digit OTP sent to admin email |

**Response:**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "abc123...",
    "mustChangePassword": false,
    "admin": {
      "id": "6649...",
      "firstName": "Alice",
      "lastName": "Smith",
      "email": "alice@servixos.com"
    }
  }
}
```

**Errors:**

| Code | Reason |
|---|---|
| `401` | Invalid/expired `otpToken`, OTP expired in Redis, or wrong OTP |

---

### POST `/api/admin/api/auth/change-password`

Change the authenticated admin's password. Clears the `mustChangePassword` flag.

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `currentPassword` | string | Yes | Admin's existing password |
| `newPassword` | string | Yes | Minimum 8 characters |

**Response:**

```json
{
  "data": { "changed": true }
}
```

**Errors:**

| Code | Reason |
|---|---|
| `400` | Current password is incorrect |

---

### POST `/api/admin/api/auth/refresh`

Rotate access token using a refresh token. Refresh tokens are valid for **30 days**.

**Auth required:** No

**Request body:**

| Field | Type | Required |
|---|---|---|
| `refreshToken` | string | Yes |

**Response:**

```json
{
  "data": { "accessToken": "eyJ..." }
}
```

**Errors:**

| Code | Reason |
|---|---|
| `401` | Token not found, expired, or admin is no longer active |

---

### POST `/api/admin/api/auth/logout`

Revoke the current refresh token.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `refreshToken` | string | Yes |

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Dashboard

### GET `/api/admin/api/dashboard`

Aggregate platform-wide statistics.

**Auth required:** Yes

**Response:**

```json
{
  "data": {
    "totalUsers": 1240,
    "monthlyRevenue": 48500,
    "activeBusinesses": 87,
    "revenueHistory": [
      { "label": "Jan", "value": 32000 },
      { "label": "Feb", "value": 35000 },
      { "label": "Mar", "value": 41000 },
      { "label": "Apr", "value": 38000 },
      { "label": "May", "value": 44000 },
      { "label": "Jun", "value": 48500 }
    ],
    "growthHistory": [
      { "label": "Jan", "value": 0 },
      { "label": "Feb", "value": 12.5 },
      { "label": "Mar", "value": 8.3 },
      { "label": "Apr", "value": -4.2 },
      { "label": "May", "value": 15.8 },
      { "label": "Jun", "value": 6.1 }
    ]
  }
}
```

`revenueHistory` — last 6 months of total subscription revenue. Missing months are `0`.

`growthHistory` — month-over-month percentage growth in new business registrations. The first slot is always `0` (no prior month to compare against).

---

### GET `/api/admin/api/dashboard/recent-activities`

Last 20 platform-wide activity log entries across all businesses.

**Auth required:** Yes

**Response:**

```json
{
  "data": [
    {
      "_id": "664a...",
      "actorName": "John Doe",
      "actorEmail": "john@example.com",
      "actorRole": "owner",
      "action": "created",
      "target": "invoice",
      "targetId": "664b...",
      "businessId": "664c...",
      "businessName": "Acme Corp",
      "createdAt": "2026-06-12T10:45:00.000Z"
    }
  ]
}
```

---

## Users

### GET `/api/admin/api/users`

Paginated list of all platform users with a stats header.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Values |
|---|---|---|---|
| `page` | number | `1` | — |
| `limit` | number | `10` | — |
| `search` | string | — | Name or email substring |
| `status` | string | `all` | `all` \| `active` \| `suspended` \| `pending` |
| `role` | string | `all` | `all` \| `owner` \| `employee` \| `staff` \| `client` |

**Response:**

```json
{
  "data": {
    "stats": {
      "total": 1240,
      "active": 1180,
      "suspended": 42,
      "pending": 18
    },
    "users": [
      {
        "_id": "664a...",
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@acme.com",
        "userRole": "owner",
        "isActive": true,
        "isEmailVerified": true,
        "businessName": "Acme Corp",
        "createdAt": "2026-01-15T09:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 1240,
      "totalPages": 124
    }
  }
}
```

---

### GET `/api/admin/api/users/:id`

Full user profile enriched with business name.

**Auth required:** Yes

**Response:** Single user object (same shape as list item, with additional fields like `lastLoginAt`).

**Errors:**

| Code | Reason |
|---|---|
| `404` | User not found |

---

### PATCH `/api/admin/api/users/:id/toggle-suspend`

Toggle a single user's active state. Calling it twice returns the user to the original state.

**Auth required:** Yes

**Response:**

```json
{ "data": { "suspended": true } }
```

**Errors:**

| Code | Reason |
|---|---|
| `404` | User not found |

---

### PATCH `/api/admin/api/users/bulk/toggle-suspend`

Suspend or reactivate multiple users at once.

**Auth required:** Yes

> **Bulk logic:** If `suspend` is omitted, the server checks whether any user in the batch is currently active — if so, all are suspended; if all are already suspended, all are reactivated.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userIds` | `string[]` | Yes | MongoDB ObjectId array, min 1 |
| `suspend` | boolean | No | Explicit override; omit to auto-toggle |

**Response:**

```json
{ "data": { "modifiedCount": 4 } }
```

---

### POST `/api/admin/api/users/invite`

Create a user account and send an invitation email with a temporary password.

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `fullName` | string | Yes | Full name (space-separated) |
| `email` | string | Yes | Must be unique |
| `role` | string | Yes | `owner` or `employee` |
| `businessName` | string | No | Exact name of an existing business to associate |

**Response:** `201 Created`, no `data` field.

**Errors:**

| Code | Reason |
|---|---|
| `409` | Email already registered |
| `404` | `businessName` provided but not found |

---

### POST `/api/admin/api/users/send-email`

Send a custom admin email to multiple users.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `userIds` | `string[]` | Yes |
| `subject` | string | Yes |
| `message` | string | Yes |

**Response:**

```json
{ "data": { "sent": 3 } }
```

---

### POST `/api/admin/api/users/:id/send-email`

Send a custom admin email to a single user.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `subject` | string | Yes |
| `message` | string | Yes |

**Response:** `200 OK`, no `data` field.

**Errors:**

| Code | Reason |
|---|---|
| `404` | User not found |

---

### POST `/api/admin/api/users/:id/reset-password`

Trigger a password-reset OTP email for the specified user (30-minute expiry).

**Auth required:** Yes

**Response:** `200 OK`, no `data` field.

**Errors:**

| Code | Reason |
|---|---|
| `404` | User not found |

---

## Businesses

### GET `/api/admin/api/businesses`

Paginated list of all registered businesses.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Values |
|---|---|---|---|
| `page` | number | `1` | — |
| `limit` | number | `10` | — |
| `search` | string | — | Business name or email substring |
| `status` | string | `all` | `all` \| `active` \| `suspended` \| `pending` |

**Response:**

```json
{
  "data": {
    "businesses": [
      {
        "_id": "664c...",
        "name": "Acme Corp",
        "isSuspended": false,
        "plan": "pro",
        "ownerFirstName": "Bob",
        "ownerLastName": "Smith",
        "ownerEmail": "bob@acme.com",
        "createdAt": "2026-02-01T08:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 87,
      "totalPages": 9
    }
  }
}
```

---

### GET `/api/admin/api/businesses/:id`

Full business profile with owner details.

**Auth required:** Yes

**Errors:**

| Code | Reason |
|---|---|
| `404` | Business not found |

---

### PATCH `/api/admin/api/businesses/:id/suspend`

Suspend a business and deactivate all its staff accounts. TenantGuard will block all subsequent requests from this business until reactivated.

**Auth required:** Yes

**Response:** `200 OK`, no `data` field.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Business not found |

---

### PATCH `/api/admin/api/businesses/:id/reactivate`

Reactivate a suspended business and restore all its staff accounts.

**Auth required:** Yes

**Response:** `200 OK`, no `data` field.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Business not found |

---

### PATCH `/api/admin/api/businesses/bulk/toggle-suspend`

Suspend or reactivate multiple businesses at once.

**Auth required:** Yes

> **Bulk logic:** If any business in the batch is currently active, all are suspended. If all are already suspended, all are reactivated. Staff accounts follow the business state.

**Request body:**

| Field | Type | Required |
|---|---|---|
| `businessIds` | `string[]` | Yes (min 1) |

**Response:**

```json
{ "data": { "modifiedCount": 3, "suspended": true } }
```

---

### POST `/api/admin/api/businesses/send-email`

Send a custom email to owners of multiple businesses.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `businessIds` | `string[]` | Yes |
| `subject` | string | Yes |
| `message` | string | Yes |

**Response:**

```json
{ "data": { "sent": 3 } }
```

---

### POST `/api/admin/api/businesses/:id/send-email`

Send a custom email to a single business owner.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `subject` | string | Yes |
| `message` | string | Yes |

**Response:** `200 OK`, no `data` field.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Business not found |

---

## Subscriptions

### GET `/api/admin/api/subscriptions`

Platform-wide subscription analytics.

**Auth required:** Yes

**Response:**

```json
{
  "data": {
    "stats": {
      "totalActive": 87,
      "starter": 34,
      "growth": 28,
      "pro": 25,
      "mrrTotal": 48500
    },
    "mrrHistory": [
      { "label": "Jan", "value": 32000 },
      { "label": "Feb", "value": 35000 }
    ],
    "planDistribution": [
      { "plan": "starter", "count": 34, "percentage": 39.1 },
      { "plan": "growth",  "count": 28, "percentage": 32.2 },
      { "plan": "pro",     "count": 25, "percentage": 28.7 }
    ],
    "recentPlanChanges": [
      {
        "businessName": "Acme Corp",
        "fromPlan": "growth",
        "toPlan": "pro",
        "type": "upgrade",
        "createdAt": "2026-06-10T14:30:00.000Z"
      }
    ]
  }
}
```

`type` values: `conversion` | `upgrade` | `downgrade` | `churn`

---

## Activity Logs

### GET `/api/admin/api/activity-logs`

Paginated, searchable activity log across all businesses.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | number | `1` | — |
| `limit` | number | `10` | — |
| `search` | string | — | Searches `actorName`, `action`, `target` |
| `actorRole` | string | — | Filter by actor role (e.g. `owner`, `employee`) |

**Response:**

```json
{
  "data": {
    "logs": [
      {
        "_id": "664d...",
        "actorName": "John Doe",
        "actorEmail": "john@acme.com",
        "actorRole": "owner",
        "action": "updated",
        "target": "job",
        "targetId": "664e...",
        "businessId": "664c...",
        "businessName": "Acme Corp",
        "metadata": {},
        "createdAt": "2026-06-12T11:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 3402,
      "totalPages": 341
    }
  }
}
```

---

## Roles & Team

### GET `/api/admin/api/roles`

List all admin roles with live member counts.

**Auth required:** Yes

**Response:**

```json
{
  "data": [
    {
      "_id": "664f...",
      "name": "Admin",
      "description": "Full platform access with all permissions",
      "permissions": ["users.view", "users.manage", "..."],
      "isSystem": true,
      "memberCount": 1,
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "_id": "6650...",
      "name": "Support",
      "description": "Support team",
      "permissions": ["support.view", "support.manage"],
      "isSystem": false,
      "memberCount": 3,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**Available permission keys:**

| Key | Label |
|---|---|
| `users.view` | View Users |
| `users.manage` | Manage Users |
| `businesses.view` | View Businesses |
| `businesses.manage` | Manage Businesses |
| `billing.view` | View Billing |
| `billing.manage` | Manage Billing |
| `roles.view` | View Roles |
| `roles.manage` | Manage Roles |
| `support.view` | View Support |
| `support.manage` | Manage Support |
| `activity_logs.view` | View Activity Logs |
| `subscriptions.view` | View Subscriptions |

**System roles** (`isSystem: true`) cannot be deleted and their names cannot be changed. Only the "Admin" role is a system role.

---

### GET `/api/admin/api/roles/team`

List all admin team members with their assigned role.

**Auth required:** Yes

**Response:**

```json
{
  "data": [
    {
      "_id": "6651...",
      "firstName": "Alice",
      "lastName": "Smith",
      "email": "alice@admin.com",
      "isActive": true,
      "isInvited": true,
      "roleName": "Support",
      "roleId": "6650..."
    }
  ]
}
```

---

### POST `/api/admin/api/roles`

Create a new custom role.

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | Min 2 characters, must be unique |
| `description` | string | No | — |
| `permissions` | `string[]` | Yes | Array of valid permission keys (may be empty `[]`) |

**Response:** `201 Created`, returns the new role object.

**Errors:**

| Code | Reason |
|---|---|
| `409` | Role name already taken |

---

### PATCH `/api/admin/api/roles/:id`

Update a role's name, description, or permissions. All fields are optional.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `name` | string | No |
| `description` | string | No |
| `permissions` | `string[]` | No |

**Response:** Updated role object.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Role not found |
| `409` | New name is already taken |

---

### DELETE `/api/admin/api/roles/:id`

Delete a custom role.

**Auth required:** Yes

> System roles and roles with active members cannot be deleted.

**Response:**

```json
{ "data": { "deleted": true } }
```

**Errors:**

| Code | Reason |
|---|---|
| `404` | Role not found |
| `403` | Role is a system role (`isSystem: true`) |
| `403` | Role still has members assigned to it |

---

### PATCH `/api/admin/api/roles/assign`

Assign a role to an admin team member.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `adminId` | string | Yes |
| `roleId` | string | Yes |

**Response:**

```json
{
  "data": {
    "adminId": "6651...",
    "roleId": "6650...",
    "roleName": "Support"
  }
}
```

**Errors:**

| Code | Reason |
|---|---|
| `404` | Admin or role not found |

---

### POST `/api/admin/api/roles/team/invite`

Invite a new admin team member. Creates an account with a system-generated temporary password and sends an invitation email. The invited admin must verify OTP on every login.

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | Yes | — |
| `lastName` | string | Yes | — |
| `email` | string | Yes | Must not be used by another admin |
| `roleId` | string | No | Assign a role at invite time |

**Response:** `201 Created`, no `data` field.

**Errors:**

| Code | Reason |
|---|---|
| `409` | Email already registered as an admin |
| `404` | `roleId` provided but not found |

---

## Support Tickets

### Admin — ticket management

#### GET `/api/admin/api/support`

Paginated list of all support tickets with a stats header.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Default | Values |
|---|---|---|---|
| `page` | number | `1` | — |
| `limit` | number | `10` | — |
| `search` | string | — | Subject or requester name |
| `status` | string | — | `open` \| `in_progress` \| `resolved` \| `closed` |

**Response:**

```json
{
  "data": {
    "stats": {
      "open": 12,
      "inProgress": 4,
      "resolved": 31,
      "closed": 88
    },
    "tickets": [
      {
        "_id": "6652...",
        "ticketNumber": "T-1001",
        "subject": "Cannot log into dashboard",
        "description": "...",
        "priority": "high",
        "status": "open",
        "category": "Technical",
        "requesterName": "John Doe",
        "requesterEmail": "john@acme.com",
        "businessName": "Acme Corp",
        "assigneeName": null,
        "createdAt": "2026-06-10T09:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 135,
      "totalPages": 14
    }
  }
}
```

**Status values:** `open` | `in_progress` | `resolved` | `closed`

**Priority values:** `low` | `medium` | `high` | `urgent`

**Category values:** `Technical` | `Account` | `Billing` | `General`

---

#### GET `/api/admin/api/support/admins`

List all active admin team members for the assign-ticket modal.

**Auth required:** Yes

**Response:**

```json
{
  "data": [
    { "_id": "6651...", "firstName": "Alice", "lastName": "Smith", "email": "alice@admin.com" }
  ]
}
```

---

#### GET `/api/admin/api/support/:id`

Full ticket detail including all replies.

**Auth required:** Yes

**Response:**

```json
{
  "data": {
    "_id": "6652...",
    "ticketNumber": "T-1001",
    "subject": "Cannot log into dashboard",
    "description": "I keep getting a 401 error when I try to log in...",
    "priority": "high",
    "status": "in_progress",
    "category": "Technical",
    "requesterId": "664a...",
    "requesterName": "John Doe",
    "requesterEmail": "john@acme.com",
    "businessId": "664c...",
    "businessName": "Acme Corp",
    "assigneeId": "6651...",
    "assigneeName": "Alice Smith",
    "replies": [
      {
        "content": "We are investigating the issue.",
        "authorId": "6651...",
        "authorName": "Alice Smith",
        "authorType": "admin",
        "createdAt": "2026-06-10T10:30:00.000Z"
      }
    ],
    "createdAt": "2026-06-10T09:00:00.000Z"
  }
}
```

**Errors:**

| Code | Reason |
|---|---|
| `404` | Ticket not found |

---

#### PATCH `/api/admin/api/support/:id/assign`

Assign or unassign a ticket. Pass `adminId: null` (or omit) to clear the assignee. Blocked on closed tickets.

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `adminId` | string | No | Admin ObjectId; omit or set `null` to unassign |

**Response:** Updated ticket object.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Ticket or admin not found |
| `400` | Ticket is already closed |

---

#### POST `/api/admin/api/support/:id/reply`

Add a reply to a ticket as the authenticated admin.

**Auth required:** Yes

**Request body:**

| Field | Type | Required |
|---|---|---|
| `content` | string | Yes |

**Response:** Updated ticket object with the new reply appended to `replies`.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Ticket not found |
| `400` | Ticket is already closed |

---

#### PATCH `/api/admin/api/support/:id/resolve`

Mark a ticket as resolved. Blocked on closed tickets.

**Auth required:** Yes

**Response:** Updated ticket object with `status: "resolved"` and `resolvedAt` timestamp.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Ticket not found |
| `400` | Ticket is already closed |

---

#### PATCH `/api/admin/api/support/:id/close`

Permanently close a ticket. Once closed, no further replies, assignments, or status changes are allowed.

**Auth required:** Yes

**Response:** Updated ticket object with `status: "closed"` and `closedAt` timestamp.

**Errors:**

| Code | Reason |
|---|---|
| `404` | Ticket not found |
| `400` | Ticket is already closed |

---

### Business portal — ticket creation

These endpoints are on the **business portal** (`/api/...`) and require standard business JWT + `X-Business-Id` header.

#### POST `/api/support/tickets`

Create a new support ticket. Ticket numbers are sequential (`T-1001`, `T-1002`, …).

**Auth required:** Yes (business portal JWT)

**Headers:**

```
Authorization: Bearer <business-access-token>
X-Business-Id: <businessId>
```

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `subject` | string | Yes | Min 5 characters |
| `description` | string | Yes | Min 10 characters |
| `priority` | string | Yes | `low` \| `medium` \| `high` \| `urgent` |
| `category` | string | Yes | `Technical` \| `Account` \| `Billing` \| `General` |

**Response:** `201 Created`

```json
{
  "data": {
    "_id": "6652...",
    "ticketNumber": "T-1001",
    "subject": "Cannot log into dashboard",
    "status": "open",
    "priority": "high",
    "category": "Technical",
    "createdAt": "2026-06-12T11:00:00.000Z"
  }
}
```

---

#### GET `/api/support/tickets`

List the business's own tickets (paginated).

**Auth required:** Yes (business portal JWT)

**Query parameters:** `page`, `limit`

---

#### GET `/api/support/tickets/:id`

Get a specific ticket (scoped to the requesting business).

**Auth required:** Yes (business portal JWT)

---

## Standard Response Shapes

### Pagination meta

Every list endpoint returns a `meta` object:

```json
{
  "page": 1,
  "limit": 10,
  "total": 135,
  "totalPages": 14
}
```

### Error response

```json
{
  "success": false,
  "statusCode": 404,
  "message": "User not found"
}
```

### Common HTTP status codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Bad request / validation error |
| `401` | Unauthenticated (missing or invalid token) |
| `403` | Forbidden (role/system constraint) |
| `404` | Resource not found |
| `409` | Conflict (duplicate email, name, etc.) |
| `500` | Internal server error |

---

## Token Lifecycle

```
Login ──────────────────────────────────────┐
  │                                         │
  ▼                                         ▼
Standard admin                        Invited admin
accessToken (JWT, short-lived)        otpToken (JWT, 10 min)
refreshToken (30 days)                  │
  │                                    ▼
  │                              POST /verify-otp
  │                                    │
  │                                    ▼
  │                              accessToken + refreshToken
  │                                    │
  └──────────────┬─────────────────────┘
                 │
                 ▼
        Use accessToken in
        Authorization header
                 │
                 ▼
        Token expires → POST /refresh → new accessToken
                 │
                 ▼
        Logout → POST /logout (revokes refreshToken)
```

**mustChangePassword flow:** When `mustChangePassword: true` is returned from login, the frontend should redirect to a change-password screen. The admin can still make API calls with the token, but it is strongly recommended to block navigation until `POST /change-password` is completed.
