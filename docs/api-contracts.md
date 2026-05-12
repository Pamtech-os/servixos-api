# Contracts API

Contracts are linked to a job and a client. A business creates a contract from a job, optionally generates a PDF, emails it to the client, and tracks whether the client has signed it.

---

## Authentication

**Business portal** — all endpoints under `/api/contracts` require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-client-token` | Ephemeral session token from `GET /api/auth/client-token` |
| `x-timestamp` | Unix timestamp in milliseconds |
| `x-signature` | HMAC-SHA256 signature (see README) |

**Client portal** — all endpoints under `/api/client/api/contracts` require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <clientAccessToken>` |

---

## Business Portal

Base URL: `/api/contracts`

---

### GET /api/contracts

List all contracts for the authenticated business.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `clientId` | ObjectId | no | Filter by client |
| `status` | enum | no | `draft` `sent` `signed` `cancelled` |
| `page` | integer | no | Default `1`, min `1` |
| `limit` | integer | no | Default `10`, max `50` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Contracts retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "jobId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "clientId": "64f1a2b3c4d5e6f7a8b9c0d3",
      "title": "Residential HVAC Service Contract",
      "html": "<html>...",
      "pdfUrl": "https://res.cloudinary.com/servixos/contracts/abc123.pdf",
      "amount": 1500.00,
      "status": "sent",
      "expiresAt": "2024-06-01T00:00:00.000Z",
      "sentAt": "2024-03-15T10:00:00.000Z",
      "signedAt": null,
      "signingUrl": null,
      "timezone": "America/New_York",
      "createdAt": "2024-03-15T09:00:00.000Z",
      "updatedAt": "2024-03-15T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```

---

### GET /api/contracts/:id

Get a single contract by ID.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Contract ID |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Contract found",
  "data": { ...contract }
}
```

**Errors:** `404` if not found or belongs to a different business.

---

### POST /api/contracts

Create a new contract. The contract HTML is auto-generated from the job details; a PDF can be requested separately.

Note: each job can have at most one contract — creating a second contract for the same job returns `409`.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientId` | ObjectId | yes | |
| `jobId` | ObjectId | yes | |
| `name` | string | yes | Contract title (whitespace trimmed) |
| `amount` | number | yes | Must be ≥ 0 |
| `expiresAt` | ISO date string | no | |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Contract created",
  "data": { ...contract }
}
```

**Errors:** `404` if job or client not found; `409` if a contract already exists for this job.

---

### PATCH /api/contracts/:id

Update a contract's status or signature date.

**Request body** (all fields optional)

| Field | Type | Notes |
|---|---|---|
| `status` | enum | `draft` `sent` `signed` `cancelled` |
| `signedAt` | ISO date string | |

**Response `200`** — updated contract object.

**Errors:** `404` if not found.

---

### DELETE /api/contracts/:id

Soft-delete a contract (sets `deletedAt`; does not remove from the database).

**Response `200`**
```json
{ "success": true, "statusCode": 200, "message": "Contract deleted", "data": null }
```

**Errors:** `404` if not found.

---

### GET /api/contracts/:id/pdf

Retrieve the Cloudinary PDF URL for a contract. If no PDF has been generated yet, one is rendered from the contract HTML and uploaded before responding.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "PDF ready",
  "data": {
    "url": "https://res.cloudinary.com/servixos/contracts/abc123.pdf"
  }
}
```

**Errors:** `404` if contract not found.

---

### POST /api/contracts/:id/send

Email the contract PDF to the client. Sets status to `sent` and records `sentAt`.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientEmail` | string | yes | Valid email address |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Contract sent",
  "data": { "queued": true }
}
```

**Errors:** `404` if not found; `400` if the contract is already signed or cancelled.

---

## Client Portal

Base URL: `/api/client/api/contracts`

---

### GET /api/client/api/contracts

List all contracts addressed to the authenticated client.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `status` | enum | no | `awaiting_signature` `signed` `expired` `cancelled` |
| `sort` | enum | no | `dateSent` `amount` — default `dateSent` |
| `order` | enum | no | `asc` `desc` — default `desc` |
| `page` | integer | no | Default `1`, max `100` per page |
| `limit` | integer | no | Max `100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Contracts retrieved",
  "data": [ ...contracts ],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 },
  "timestamp": "2024-03-15T10:00:00.000Z"
}
```

---

### GET /api/client/api/contracts/:id

Get a single contract addressed to the authenticated client.

**Response `200`** — contract object + `timestamp`.

**Errors:** `404` if not found or does not belong to this client.

---

### PATCH /api/client/api/contracts/:id/sign

Sign a contract. Uploads the signature image, marks the contract as `signed`, and records `signedAt`.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `signatureData` | string | yes | Base64 image — must begin with `data:image/png;base64,` or `data:image/jpeg;base64,` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Contract signed",
  "data": { ...updatedContract },
  "timestamp": "2024-03-15T12:00:00.000Z"
}
```

**Errors:** `400` if already signed, expired, or signature format is invalid; `404` if not found.

---

## Contract Object Reference

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `jobId` | ObjectId | |
| `clientId` | ObjectId | |
| `title` | string | |
| `html` | string | Raw HTML of the contract body |
| `pdfUrl` | string? | Cloudinary secure URL |
| `cloudinaryPublicId` | string? | |
| `amount` | number | |
| `expiresAt` | ISO date? | |
| `status` | enum | `draft` `sent` `signed` `cancelled` |
| `sentAt` | ISO date? | Populated when emailed to client |
| `signedAt` | ISO date? | Populated when client signs |
| `signingUrl` | string? | |
| `timezone` | string | IANA timezone string |
| `deletedAt` | ISO date? | Present only on soft-deleted records |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |
