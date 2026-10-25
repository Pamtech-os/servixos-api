# Client Authentication API

Base URL: `/api/client-auth`

This module handles authentication for the **client portal** — the separate app used by end-clients to view their jobs, invoices, contracts, and messages. It is distinct from the business-portal auth.

All endpoints are **public** (no auth guard), but HMAC request signing is still required.

---

## Request Signing

| Header | Value |
|---|---|
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

---

## Endpoints

### POST /api/client-auth/login

Authenticate a client. Clients are invited by a business; their credentials are provisioned when the business accepts a service request or creates a client record.

**Request body**
```json
{
  "email": "client@example.com",
  "password": "SecurePass1"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | |
| `password` | string | yes | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>",
    "client": {
      "_id": "...",
      "name": "Alice Brown",
      "email": "alice@example.com",
      "businessId": "..."
    }
  }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 401 | Invalid credentials |

---

### POST /api/client-auth/refresh

Refresh the client access token.

**Request body**
```json
{
  "refreshToken": "<opaque>"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token refreshed",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>"
  }
}
```

---

### POST /api/client-auth/logout

Invalidate the client's refresh token.

**Request body**
```json
{
  "refreshToken": "<opaque>"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out successfully",
  "data": null
}
```

---

### POST /api/client-auth/forgot-password

Send a password-reset OTP to the client's email.

**Request body**
```json
{
  "email": "client@example.com"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password reset email sent",
  "data": null
}
```

---

### POST /api/client-auth/reset-password

Reset the client's password using the OTP received by email.

**Request body**
```json
{
  "otp": "123456",
  "newPassword": "NewSecure1"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `otp` | string | yes | 6-digit OTP from email |
| `newPassword` | string | yes | min 8 chars, 1 uppercase, 1 digit |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password reset successful",
  "data": null
}
```

---

### GET /api/client-auth/me

Get the authenticated client's profile. Requires a valid access token in the `Authorization` header.

**Headers**
```
Authorization: Bearer <clientAccessToken>
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile retrieved",
  "data": {
    "_id": "...",
    "name": "Alice Brown",
    "email": "alice@example.com",
    "phone": "+2348012345678",
    "businessId": "..."
  }
}
```

---

## JWT Payload (client portal)

Decoded client `accessToken` contains:

```json
{
  "sub": "<userId>",
  "clientId": "<clientId>",
  "businessId": "<businessId>",
  "aud": "client",
  "iat": 1700000000,
  "exp": 1700086400
}
```

The `accessToken` must be sent as `Authorization: Bearer <token>` on all client-portal protected endpoints (prefix `/api/client/api/...`).

---

## Client Portal Endpoints (after login)

Once authenticated, clients can access:

| Endpoint | Description |
|---|---|
| `GET /api/client/api/dashboard` | Summary: jobs, invoices, unread messages |
| `GET /api/client/api/jobs` | List their jobs |
| `GET /api/client/api/invoices` | List their invoices |
| `GET /api/client/api/contracts` | List their contracts |
| `PATCH /api/client/api/contracts/:id/sign` | Sign a contract |
| `GET /api/client/api/activities` | Activity feed |
| `GET /api/client/api/contacts` | Business contact info |

Client-portal WebSocket namespace: `/client-messages` (separate from the business `/chat` namespace).
