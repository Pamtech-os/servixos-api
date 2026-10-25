# Clients API

Base URL: `/api/clients`

All endpoints require business-portal authentication.

**Required headers on every request**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

---

## Data Model

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | owning business |
| `userId` | ObjectId? | linked user account (set after client accepts portal invite) |
| `name` | string | |
| `email` | string | unique per business, lowercased |
| `phone` | string? | |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

## Endpoints

### GET /api/clients

List all clients for the authenticated business with optional search and pagination.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `search` | string | no | Fuzzy search on name/email |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `50` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Clients retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "name": "John Smith",
      "email": "john@example.com",
      "phone": "+2348012345678",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### GET /api/clients/:id

Get a single client by ID.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Client found",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "businessId": "...",
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "+2348012345678",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | Client not found |

---

### POST /api/clients

Create a new client.

**Request body**
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "+2348012345678"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | |
| `email` | string | yes | must be unique per business |
| `phone` | string | no | |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Client created",
  "data": {
    "_id": "...",
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "+2348012345678",
    ...
  }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 409 | A client with this email already exists for the business |

---

### PATCH /api/clients/:id

Update an existing client. All fields are optional.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | |

**Request body**
```json
{
  "name": "John A. Smith",
  "email": "johnsmith@example.com",
  "phone": "+2348099999999"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Client updated",
  "data": { ...updatedClient }
}
```

---

### DELETE /api/clients/:id

Soft-delete a client (sets `deletedAt`).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Client deleted"
}
```

---

### GET /api/clients/:id/export

Export all data for a client (profile + all jobs) as a JSON file hosted on Cloudinary.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data exported",
  "data": {
    "exportUrl": "https://res.cloudinary.com/.../client-export-<id>.json"
  }
}
```

The `exportUrl` is a Cloudinary secure URL pointing to a JSON file containing:
- `exportedAt` — ISO timestamp
- `client` — `{ id, name, email, phone }`
- `jobs` — array of `{ id, title, description, status, scheduledDate, location, price, timezone }`

---

## Permissions required

| Action | Permission |
|---|---|
| List / Get | `clients.view` |
| Create | `clients.create` |
| Update | `clients.edit` |
| Delete | `clients.delete` |
| Export | `clients.view` |
