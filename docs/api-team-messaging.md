# Team Messaging API

The team messaging module provides an internal chat feed for business staff. Team messages are visible to everyone in the business. There is no direct-message or threading — it is a single shared channel per business.

All endpoints are business-portal only. There is no client-portal equivalent.

---

## Authentication

All endpoints require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-client-token` | Ephemeral session token from `GET /api/auth/client-token` |
| `x-timestamp` | Unix timestamp in milliseconds |
| `x-signature` | HMAC-SHA256 signature (see README) |

---

## REST Endpoints

Base URL: `/api/team`

---

### GET /api/team/messages

List all team messages for the business, newest first.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Team messages retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "senderId": "64f1a2b3c4d5e6f7a8b9c0d5",
      "senderName": "Jane Doe",
      "content": "The morning crew starts at 7 AM tomorrow.",
      "createdAt": "2024-03-15T09:00:00.000Z",
      "updatedAt": "2024-03-15T09:00:00.000Z"
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

**Message fields**

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `senderId` | ObjectId | References the Employee who sent the message |
| `senderName` | string | Display name at time of sending |
| `content` | string | Message text |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

### POST /api/team/messages

Post a new message to the team channel.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | yes | Max 5000 characters |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Team message sent",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "businessId": "...",
    "senderId": "...",
    "senderName": "Jane Doe",
    "content": "The morning crew starts at 7 AM tomorrow.",
    "createdAt": "2024-03-15T09:00:00.000Z",
    "updatedAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Errors:** `400` if content is empty or exceeds 5000 characters.

---

## WebSocket

Team messaging currently uses REST polling only — there is no real-time WebSocket channel for the team message feed. Implement periodic polling of `GET /api/team/messages` to show new messages.

> If real-time team messaging is added in a future release, this section will be updated with Socket.io namespace details.
