# Announcements API

Announcements are broadcast messages posted by business owners or managers for all staff to see. Unlike team messages, announcements have a structured title + description format and are intended for important notices (e.g. schedule changes, policy updates).

All endpoints are business-portal only.

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

### GET /api/team/announcements

List all announcements for the business, newest first.

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
  "message": "Announcements retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "authorId": "64f1a2b3c4d5e6f7a8b9c0d5",
      "authorName": "Michael Scott",
      "title": "Office Hours Update",
      "description": "Starting Monday, the office will open at 8 AM instead of 9 AM. Please adjust your schedules accordingly.",
      "createdAt": "2024-03-15T09:00:00.000Z",
      "updatedAt": "2024-03-15T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "totalPages": 1
  }
}
```

**Announcement fields**

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `authorId` | ObjectId | References the Employee who created the announcement |
| `authorName` | string | Display name at time of creation |
| `title` | string | Max 200 characters |
| `description` | string | Full announcement body |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

### POST /api/team/announcements

Create a new announcement.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | Max 200 characters |
| `description` | string | yes | Max 5000 characters |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Announcement created",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "businessId": "...",
    "authorId": "...",
    "authorName": "Michael Scott",
    "title": "Office Hours Update",
    "description": "Starting Monday, the office will open at 8 AM instead of 9 AM.",
    "createdAt": "2024-03-15T09:00:00.000Z",
    "updatedAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Errors:** `400` if title or description is empty or exceeds the character limit.
