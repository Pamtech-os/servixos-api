# Schedules API

The schedules module manages employee shift scheduling. Shifts are organised by week. Each shift belongs to one employee and has a date, start time, and end time. The API prevents overlapping shifts for the same employee.

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

Base URL: `/api/schedules`

---

### GET /api/schedules

List all shifts for a given week. If no `weekStartDate` is provided, the current week (relative to the business timezone) is used.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `weekStartDate` | ISO date string | no | Must be a Monday (`YYYY-MM-DD`). Defaults to the current week's Monday in the business timezone. |
| `employeeId` | ObjectId | no | Filter shifts for a single employee |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Schedules retrieved",
  "weekStartDate": "2024-03-11T00:00:00.000Z",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "employeeId": "64f1a2b3c4d5e6f7a8b9c0d5",
      "shiftDate": "2024-03-12T00:00:00.000Z",
      "startTime": "09:00",
      "endTime": "17:00",
      "notes": "Morning shift — client site visit",
      "weekStartDate": "2024-03-11T00:00:00.000Z",
      "createdAt": "2024-03-10T08:00:00.000Z",
      "updatedAt": "2024-03-10T08:00:00.000Z"
    }
  ]
}
```

Note: the response includes `weekStartDate` at the top level (not inside `meta`).

**Shift fields**

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `employeeId` | ObjectId | |
| `shiftDate` | ISO date | Date of the shift (`YYYY-MM-DD`) |
| `startTime` | string | `HH:mm` (24-hour), e.g. `"09:00"` |
| `endTime` | string | `HH:mm` (24-hour), e.g. `"17:00"` |
| `notes` | string? | Optional free-text notes |
| `weekStartDate` | ISO date | The Monday of the week this shift belongs to |
| `deletedAt` | ISO date? | Present on soft-deleted records |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

### POST /api/schedules

Create a new shift for an employee.

**Validation rules:**
- `startTime` must be earlier than `endTime`
- The shift must not overlap with another existing shift for the same employee on the same day

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `employeeId` | ObjectId | yes | |
| `shiftDate` | ISO date string | yes | Format `YYYY-MM-DD` |
| `startTime` | string | yes | `HH:mm`, 24-hour format (e.g. `"09:00"`) |
| `endTime` | string | yes | `HH:mm`, 24-hour format (e.g. `"17:00"`) |
| `notes` | string | no | Whitespace trimmed |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Shift created",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "businessId": "...",
    "employeeId": "...",
    "shiftDate": "2024-03-12T00:00:00.000Z",
    "startTime": "09:00",
    "endTime": "17:00",
    "notes": "Morning shift",
    "weekStartDate": "2024-03-11T00:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors:**
- `400` if `startTime` ≥ `endTime` or time format is invalid
- `404` if employee not found
- `409` if the time range overlaps an existing shift for the same employee

---

### PATCH /api/schedules/:id

Update an existing shift. All fields are optional; only the fields provided are changed.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Shift ID |

**Request body** (all optional)

| Field | Type | Notes |
|---|---|---|
| `employeeId` | ObjectId | Reassign to a different employee |
| `shiftDate` | ISO date string | `YYYY-MM-DD` |
| `startTime` | string | `HH:mm` |
| `endTime` | string | `HH:mm` |
| `notes` | string | |

**Response `200`** — updated shift object.

**Errors:** `404` if not found; `409` if the new time overlaps another shift.

---

### DELETE /api/schedules/:id

Soft-delete a shift (sets `deletedAt`).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Shift ID |

**Response `200`**
```json
{ "success": true, "statusCode": 200, "message": "Shift deleted", "data": null }
```

**Errors:** `404` if not found.

---

## Typical Integration Flow

```
1. Load weekly schedule   →  GET /api/schedules?weekStartDate=2024-03-11
2. Navigate to next week  →  GET /api/schedules?weekStartDate=2024-03-18
3. Add a shift            →  POST /api/schedules
4. Edit a shift           →  PATCH /api/schedules/:id
5. Remove a shift         →  DELETE /api/schedules/:id
```

To show a single employee's schedule, add `employeeId` to the query.
