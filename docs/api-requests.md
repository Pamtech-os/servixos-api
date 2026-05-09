# Service Requests API

Base URL: `/api/requests`

Service requests are inbound enquiries from prospective clients submitted via a public-facing form (e.g., the business website). When a request is accepted it auto-creates a client record and a job.

---

## Authentication

- **Create request** — public endpoint, no auth required.
- **All other endpoints** — require business-portal authentication.

**Required headers on protected endpoints**

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
| `businessId` | ObjectId | |
| `clientId` | ObjectId? | populated once the request is accepted |
| `clientName` | string | |
| `clientEmail` | string | lowercased |
| `clientPhone` | string? | |
| `service` | string | requested service description |
| `requestedDate` | ISO date | must be today or in the future |
| `requestedEndDate` | ISO date? | |
| `message` | string? | optional message from the prospective client |
| `status` | enum | `pending` `accepted` `rejected` `cancelled` |
| `quotedPrice` | number? | set by the business when actioning the request |
| `startDate` | ISO date? | |
| `endDate` | ISO date? | |
| `actionedAt` | ISO date? | when the business last changed the status |
| `actionedBy` | ObjectId? | user who actioned the request |
| `conversationId` | ObjectId? | linked conversation (created on first chat) |
| `aiPriceEstimate` | object? | AI-generated price range |
| `hasAiPriceEstimate` | boolean | |
| `aiPriceEstimatedAt` | ISO date? | |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

### AI Price Estimate object

```json
{
  "suggestedPrice": 150,
  "lowPrice": 100,
  "highPrice": 200,
  "confidence": "medium",
  "currency": "NGN",
  "reasoning": "..."
}
```

`confidence` values: `low` | `medium` | `high`

---

## Endpoints

### GET /api/requests

List service requests for the business.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `status` | enum | no | `pending` `accepted` `rejected` `cancelled` |
| `search` | string | no | Matches on client name / email / service |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Requests retrieved",
  "statistics": {
    "total": 120,
    "pending": 45,
    "accepted": 60,
    "rejected": 10,
    "cancelled": 5
  },
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "clientName": "Alice Brown",
      "clientEmail": "alice@example.com",
      "clientPhone": "+2348012345678",
      "service": "Plumbing repair",
      "requestedDate": "2024-03-20T00:00:00.000Z",
      "message": "My kitchen sink is leaking.",
      "status": "pending",
      "quotedPrice": null,
      "hasAiPriceEstimate": false,
      "createdAt": "2024-03-15T08:30:00.000Z",
      "updatedAt": "2024-03-15T08:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

---

### GET /api/requests/:id

Get a single service request.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request found",
  "data": { ...requestObject }
}
```

---

### GET /api/requests/:id/conversation

Get or create the conversation thread linked to this request. Opens a chat channel between the business and the prospective client.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Conversation retrieved",
  "data": {
    "_id": "...",
    "businessId": "...",
    "clientId": "...",
    "lastMessageContent": "",
    "lastMessageAt": null,
    "businessUnreadCount": 0,
    "clientUnreadCount": 0
  }
}
```

---

### GET /api/requests/:id/price-estimate

Trigger an AI price estimate for the requested service. Returns a cached result if one already exists.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Price estimated",
  "data": {
    "suggestedPrice": 150,
    "lowPrice": 100,
    "highPrice": 200,
    "confidence": "medium",
    "currency": "NGN",
    "reasoning": "Based on typical plumbing rates in the region..."
  }
}
```

---

### POST /api/requests

**Public endpoint — no auth required.**

Submit a new service request. Typically called from the business's public website or booking widget.

**Query parameters** (one of these is required to identify the business)

| Param | Type | Notes |
|---|---|---|
| `businessSlug` | string | URL-friendly slug of the business |
| `businessId` | string | MongoDB ObjectId of the business |

**Idempotency**

Pass `idempotency-key: <uuid>` header to prevent duplicate submissions on retry.

**Request body**
```json
{
  "clientName": "Alice Brown",
  "clientEmail": "alice@example.com",
  "clientPhone": "+2348012345678",
  "service": "Plumbing repair",
  "requestedDate": "2024-03-20",
  "message": "My kitchen sink is leaking."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientName` | string | yes | |
| `clientEmail` | string | yes | |
| `clientPhone` | string | no | |
| `service` | string | yes | |
| `requestedDate` | ISO date string | yes | must not be in the past |
| `message` | string | no | |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Request submitted",
  "data": { ...requestObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | `requestedDate` is in the past |
| 404 | Business not found for the given slug/id |

---

### PATCH /api/requests/:id

Update a request — accept, reject, cancel, set a quoted price, or set start/end dates.

**Request body** (all fields optional)
```json
{
  "status": "accepted",
  "quotedPrice": 150,
  "startDate": "2024-03-20T09:00:00.000Z",
  "endDate": "2024-03-20T11:00:00.000Z"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | enum | no | `accepted` `rejected` `cancelled` only |
| `quotedPrice` | number | no | min `0` |
| `startDate` | ISO date | no | |
| `endDate` | ISO date | no | |

Accepting a request (`status: "accepted"`) automatically:
1. Creates a new Client record (if the email does not already exist for this business).
2. Creates a new Job for that client.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request updated",
  "data": { ...updatedRequest }
}
```

---

### DELETE /api/requests/:id

Soft-delete a request.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request deleted",
  "data": null
}
```

---

## Status Flow

```
pending → accepted  (auto-creates client + job)
pending → rejected
pending → cancelled
accepted → cancelled
```

---

## Permissions required

| Action | Permission |
|---|---|
| List / Get | `requests.view` |
| Update | `requests.edit` |
| Delete | `requests.delete` |
| Create | public — no permission required |
