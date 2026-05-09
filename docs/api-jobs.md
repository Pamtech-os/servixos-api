# Jobs API

Base URL: `/api/jobs`

Jobs represent scheduled service work assigned to a client. A job can be created manually or auto-created when a service request is accepted.

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
| `clientId` | ObjectId | required |
| `sourceRequestId` | ObjectId? | set when the job was auto-created from a request |
| `title` | string | |
| `description` | string? | |
| `scheduledDate` | ISO date | |
| `location` | string? | |
| `price` | number? | min `0` |
| `notes` | string? | |
| `status` | enum | `pending` `in_progress` `completed` `cancelled` |
| `startedAt` | ISO date? | set by `PATCH /jobs/:id/start` |
| `completedAt` | ISO date? | set by `PATCH /jobs/:id/complete` |
| `timezone` | string | IANA timezone |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

## Status Flow

```
pending → in_progress  (via PATCH /jobs/:id/start)
in_progress → completed  (via PATCH /jobs/:id/complete)
```

Only `pending` or `in_progress` jobs can be deleted.

---

## Endpoints

### GET /api/jobs

List jobs for the business with optional filters and pagination.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `search` | string | no | Matches on title |
| `clientId` | ObjectId | no | Filter by client |
| `status` | enum | no | `pending` `in_progress` `completed` `cancelled` |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `50` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Jobs retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "clientId": "...",
      "title": "Pipe repair",
      "description": "Fix kitchen sink leak",
      "scheduledDate": "2024-03-20T09:00:00.000Z",
      "location": "12 Main Street, Lagos",
      "price": 150,
      "notes": "Bring extra fittings",
      "status": "pending",
      "startedAt": null,
      "completedAt": null,
      "timezone": "Africa/Lagos",
      "createdAt": "2024-03-15T08:30:00.000Z",
      "updatedAt": "2024-03-15T08:30:00.000Z"
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

### GET /api/jobs/:id

Get a single job.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Job found",
  "data": { ...jobObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | Job not found |

---

### POST /api/jobs

Create a new job.

**Request body**
```json
{
  "clientId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "title": "Pipe repair",
  "description": "Fix kitchen sink leak",
  "scheduledDate": "2024-03-20T09:00:00.000Z",
  "location": "12 Main Street, Lagos",
  "price": 150,
  "notes": "Bring extra fittings"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientId` | ObjectId | yes | must belong to the same business |
| `title` | string | yes | |
| `description` | string | no | |
| `scheduledDate` | ISO date | yes | |
| `location` | string | no | |
| `price` | number | no | min `0` |
| `notes` | string | no | |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Job created",
  "data": { ...jobObject }
}
```

---

### PATCH /api/jobs/:id

Update job fields. All fields are optional.

**Request body**
```json
{
  "title": "Pipe & drain repair",
  "scheduledDate": "2024-03-21T10:00:00.000Z",
  "price": 200
}
```

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `description` | string | |
| `scheduledDate` | ISO date | |
| `location` | string | |
| `price` | number | min `0` |
| `notes` | string | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Job updated",
  "data": { ...updatedJob }
}
```

---

### PATCH /api/jobs/:id/start

Mark a job as in-progress. Sets `startedAt` to now.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Job started",
  "data": { ...job }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | Job is not in `pending` status |

---

### PATCH /api/jobs/:id/complete

Mark a job as completed. Sets `completedAt` to now.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Job completed",
  "data": { ...job }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | Job is not in `in_progress` status |

---

### DELETE /api/jobs/:id

Soft-delete a single job.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Job deleted",
  "data": null
}
```

---

### DELETE /api/jobs

Bulk-delete multiple jobs.

**Request body**
```json
{
  "ids": [
    "64f1a2b3c4d5e6f7a8b9c0d1",
    "64f1a2b3c4d5e6f7a8b9c0d2"
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `ids` | ObjectId[] | yes | min 1 element |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Jobs deleted",
  "data": {
    "deletedCount": 2
  }
}
```

---

### POST /api/jobs/:id/contract/generate

Generate a PDF contract for the job. Creates (or regenerates) a `Contract` document and uploads the PDF to Cloudinary.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Contract generated",
  "data": {
    "_id": "...",
    "jobId": "...",
    "clientId": "...",
    "title": "Service Contract — Pipe repair",
    "pdfUrl": "https://res.cloudinary.com/.../contract-<id>.pdf",
    "status": "draft",
    "createdAt": "..."
  }
}
```

---

### POST /api/jobs/:id/contract/send

Send the generated contract to the client via email. Updates contract status to `sent`.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Contract sent",
  "data": { ...contractObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | No contract found for this job |
| 400 | Contract already sent |

---

## Contract Data Model

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `jobId` | ObjectId | |
| `clientId` | ObjectId | |
| `title` | string | |
| `pdfUrl` | string | Cloudinary URL |
| `status` | enum | `draft` `sent` `signed` `cancelled` |
| `sentAt` | ISO date? | |
| `signedAt` | ISO date? | |
| `timezone` | string | |

---

## Permissions required

| Action | Permission |
|---|---|
| List / Get | `jobs.view` |
| Create | `jobs.create` |
| Update / Start / Complete | `jobs.edit` |
| Delete | `jobs.delete` |
| Contract generate / send | `contracts.create` |
