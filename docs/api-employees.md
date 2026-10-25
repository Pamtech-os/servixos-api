# Employees API

Base URLs:
- `/api/staff` — employee CRUD
- `/api/clock` — time-tracking (clock in/out/break)

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

## Employee Data Model

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `userId` | ObjectId? | linked user account (set after the employee accepts the invite) |
| `roleId` | ObjectId | assigned role |
| `fullName` | string | |
| `email` | string | unique per business, lowercased |
| `phone` | string? | |
| `weeklyHoursTarget` | number | default `40`, range `1`–`168` |
| `dateJoined` | ISO date? | |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

## Endpoints — Employee CRUD

### GET /api/staff

List employees for the business.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `search` | string | no | Matches on name / email |
| `roleId` | ObjectId | no | Filter by role |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `50` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Employees retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "roleId": "...",
      "fullName": "Bob Okafor",
      "email": "bob@janes-plumbing.com",
      "phone": "+2348012345678",
      "weeklyHoursTarget": 40,
      "dateJoined": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T09:00:00.000Z",
      "updatedAt": "2024-01-01T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "totalPages": 1
  }
}
```

---

### GET /api/staff/online

Get all employees currently clocked in. Response is **not cached** (`Cache-Control: no-store`).

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Online employees",
  "data": [
    {
      "_id": "...",
      "fullName": "Bob Okafor",
      "email": "bob@janes-plumbing.com",
      "clockStatus": "clocked_in"
    }
  ]
}
```

---

### GET /api/staff/:id

Get a single employee.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Employee found",
  "data": { ...employeeObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | Employee not found |

---

### GET /api/staff/:id/clock-history

Get the clock records for an employee within an optional date range.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | employee ID |

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `startDate` | ISO date | no | |
| `endDate` | ISO date | no | |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `50` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Clock history retrieved",
  "data": [
    {
      "_id": "...",
      "businessId": "...",
      "employeeId": "...",
      "clockInAt": "2024-03-15T08:00:00.000Z",
      "clockOutAt": "2024-03-15T17:00:00.000Z",
      "breakMinutes": 60,
      "totalHours": 8,
      "status": "clocked_out",
      "timezone": "Africa/Lagos",
      "createdAt": "..."
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 22,
    "totalPages": 2
  }
}
```

---

### POST /api/staff

Create and invite a new employee. Sends an invitation email with credentials.

**Request body**
```json
{
  "fullName": "Bob Okafor",
  "email": "bob@janes-plumbing.com",
  "phone": "+2348012345678",
  "roleId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "weeklyHoursTarget": 40,
  "dateJoined": "2024-01-01"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `fullName` | string | yes | |
| `email` | string | yes | unique per business |
| `phone` | string | no | |
| `roleId` | ObjectId | yes | must belong to this business |
| `weeklyHoursTarget` | number | yes | `1`–`168` |
| `dateJoined` | ISO date | no | |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Employee created",
  "data": { ...employeeObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 409 | An employee with this email already exists for the business |
| 404 | Role not found |

---

### PATCH /api/staff/:id

Update employee details. All fields optional.

**Request body**
```json
{
  "fullName": "Robert Okafor",
  "email": "robert@janes-plumbing.com",
  "roleId": "...",
  "weeklyHoursTarget": 45
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Employee updated",
  "data": { ...updatedEmployee }
}
```

---

### DELETE /api/staff/:id

Soft-delete an employee.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Employee deleted"
}
```

---

## Time Tracking (Clock) Endpoints

### Clock Record Data Model

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `employeeId` | ObjectId | |
| `clockInAt` | ISO date | |
| `clockOutAt` | ISO date? | null if currently clocked in |
| `breakMinutes` | integer | total break time in minutes |
| `breakStartedAt` | ISO date? | set when a break starts |
| `status` | enum | `clocked_in` `clocked_out` `on_break` |
| `totalHours` | number? | computed on clock-out |
| `timezone` | string | IANA timezone |

---

### POST /api/clock/in

Clock an employee in. Creates a new `ClockRecord`.

**Request body**
```json
{
  "employeeId": "64f1a2b3c4d5e6f7a8b9c0d1"
}
```

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Clocked in successfully",
  "data": {
    "_id": "...",
    "employeeId": "...",
    "clockInAt": "2024-03-15T08:00:00.000Z",
    "clockOutAt": null,
    "breakMinutes": 0,
    "status": "clocked_in",
    "timezone": "Africa/Lagos"
  }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | Employee is already clocked in |

---

### POST /api/clock/out

Clock an employee out. Sets `clockOutAt` and computes `totalHours`.

**Request body**
```json
{
  "employeeId": "64f1a2b3c4d5e6f7a8b9c0d1"
}
```

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Clocked out successfully",
  "data": {
    "_id": "...",
    "clockInAt": "2024-03-15T08:00:00.000Z",
    "clockOutAt": "2024-03-15T17:00:00.000Z",
    "breakMinutes": 60,
    "totalHours": 8,
    "status": "clocked_out"
  }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | Employee is not clocked in |

---

### POST /api/clock/break/start

Start a break for a clocked-in employee. Sets `breakStartedAt` and updates status to `on_break`.

**Request body**
```json
{
  "employeeId": "64f1a2b3c4d5e6f7a8b9c0d1"
}
```

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Break started",
  "data": { ...clockRecord }
}
```

---

### POST /api/clock/break/end

End an employee's break. Backend computes elapsed minutes from `breakStartedAt` and adds it to `breakMinutes`.

**Request body**
```json
{
  "employeeId": "64f1a2b3c4d5e6f7a8b9c0d1"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `employeeId` | ObjectId | yes | |
| `breakDurationMinutes` | integer | no | Optional legacy field. Server ignores this value and computes duration itself. |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Break ended",
  "data": { ...clockRecord }
}
```

---

### GET /api/clock/status/:employeeId

Get the current clock status for an employee.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `employeeId` | ObjectId | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Clock status",
  "data": {
    "status": "clocked_in",
    "clockInAt": "2024-03-15T08:00:00.000Z",
    "breakMinutes": 0,
    "currentRecord": { ...clockRecord }
  }
}
```

`status` values: `clocked_in` | `clocked_out` | `on_break`

---

## Permissions required

| Action | Permission |
|---|---|
| List / Get employees | `employees.view` |
| Create employee | `employees.create` |
| Update employee | `employees.edit` |
| Delete employee | `employees.delete` |
| Clock actions | `employees.edit` |
