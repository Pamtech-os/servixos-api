# Activity Logs API

Base URL: `/api/activity-logs`

Activity logs provide a complete audit trail of every mutating action performed by team members within the business. Logs are written automatically — the frontend only needs to **read** them.

---

## Authentication

All endpoints require business-portal authentication.

**Required headers**

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
| `actorId` | ObjectId | user who performed the action |
| `actorName` | string | display name of the actor |
| `actorRole` | string | role name at the time of the action |
| `action` | string | human-readable description, e.g. `"Created invoice INV-0001"` |
| `category` | enum | see categories below |
| `resourceId` | ObjectId? | ID of the affected resource |
| `resourceType` | string? | e.g. `"Invoice"`, `"Client"` |
| `ipAddress` | string? | |
| `userAgent` | string? | |
| `city` | string? | derived from IP address |
| `country` | string? | derived from IP address |
| `timestamp` | ISO date | action time in the business's local timezone |
| `createdAt` | ISO date | UTC creation time |

### Log Categories

| Value | Covers |
|---|---|
| `auth` | Login, logout, password changes |
| `client` | Client create / update / delete |
| `job` | Job create / update / status changes |
| `invoice` | Invoice create / update / send / delete |
| `payment` | Payment create / update / delete |
| `settings` | Business settings changes |
| `role` | Role create / update / delete |
| `employee` | Employee create / update / delete |
| `task` | Task actions |
| `request` | Service request actions |
| `website` | Website generation / updates |

---

## Endpoints

### GET /api/activity-logs

List activity logs for the business.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `search` | string | no | Fuzzy search on `action`, `actorName` |
| `category` | enum | no | Filter by log category |
| `dateFrom` | ISO date | no | Start of date range (inclusive) |
| `dateTo` | ISO date | no | End of date range (inclusive) |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Activity logs retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "actorId": "...",
      "actorName": "Jane Doe",
      "actorRole": "Owner",
      "action": "Created invoice INV-0001 for John Smith",
      "category": "invoice",
      "resourceId": "...",
      "resourceType": "Invoice",
      "ipAddress": "102.89.23.1",
      "city": "Lagos",
      "country": "Nigeria",
      "timestamp": "2024-03-15T11:30:00.000Z",
      "createdAt": "2024-03-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 340,
    "totalPages": 17
  }
}
```

---

## Notes for the frontend

- **`timestamp`** is already in the business's local timezone — display it as-is without conversion.
- **`createdAt`** is UTC and can be used for sorting.
- Logs are immutable — there are no create/update/delete endpoints exposed to the frontend.
- Use the `category` filter to show module-specific audit trails (e.g. show only `invoice` logs on the invoices page).
