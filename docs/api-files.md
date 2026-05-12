# Files API

The files module manages document uploads (PDFs, Word documents, images) attached to a client record. Business users upload and delete files; clients can list and download their own files via the client portal.

---

## Authentication

**Business portal** — all endpoints require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-client-token` | Ephemeral session token from `GET /api/auth/client-token` |
| `x-timestamp` | Unix timestamp in milliseconds |
| `x-signature` | HMAC-SHA256 signature (see README) |

**Client portal** — all endpoints under `/api/client/api/files` require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <clientAccessToken>` |

---

## Business Portal

### GET /api/clients/:clientId/files

List all files uploaded for a specific client.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `clientId` | ObjectId | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Files retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "clientId": "64f1a2b3c4d5e6f7a8b9c0d3",
      "filename": "site-plan.pdf",
      "cloudinaryPublicId": "servixos/client-files/abc123",
      "url": "https://res.cloudinary.com/servixos/client-files/site-plan.pdf",
      "format": "pdf",
      "filesizeBytes": 204800,
      "uploadedBy": "64f1a2b3c4d5e6f7a8b9c0d5",
      "createdAt": "2024-03-15T09:00:00.000Z",
      "updatedAt": "2024-03-15T09:00:00.000Z"
    }
  ]
}
```

**Errors:** `404` if client not found.

---

### POST /api/clients/:clientId/files

Upload a file and attach it to a client record.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `clientId` | ObjectId | |

**Content-Type:** `multipart/form-data`

| Form field | Type | Notes |
|---|---|---|
| `file` | binary | Required |

**Accepted MIME types / formats:**

| Format | MIME type |
|---|---|
| PDF | `application/pdf` |
| DOC | `application/msword` |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| PNG | `image/png` |
| JPG | `image/jpeg` |

**File size limit:** determined by the `UPLOAD_SIZE_LIMIT` environment variable.

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "File uploaded",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "businessId": "...",
    "clientId": "...",
    "filename": "contract-draft.pdf",
    "url": "https://res.cloudinary.com/servixos/client-files/contract-draft.pdf",
    "format": "pdf",
    "filesizeBytes": 102400,
    "uploadedBy": "...",
    "createdAt": "2024-03-15T09:00:00.000Z",
    "updatedAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Errors:** `400` if no file provided or unsupported format; `404` if client not found.

---

### GET /api/files/:fileId

Get the Cloudinary URL for a specific file.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `fileId` | ObjectId | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "File found",
  "data": {
    "url": "https://res.cloudinary.com/servixos/client-files/abc123.pdf"
  }
}
```

**Errors:** `404` if file not found or belongs to a different business.

---

### DELETE /api/files/:fileId

Soft-delete a file (sets `deletedAt`; file is removed from Cloudinary).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `fileId` | ObjectId | |

**Response `200`**
```json
{ "success": true, "statusCode": 200, "message": "File deleted", "data": null }
```

**Errors:** `404` if not found.

---

## Client Portal

Base URL: `/api/client/api/files`

---

### GET /api/client/api/files

List all files shared with the authenticated client.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `format` | enum | no | `pdf` `doc` `docx` `xlsx` `png` `jpg` |
| `sort` | enum | no | `generatedDate` `filename` `filesizeBytes` `createdAt` — default `createdAt` |
| `order` | enum | no | `asc` `desc` — default `desc` |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Max `100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Files retrieved",
  "data": [ ...files ],
  "meta": { "page": 1, "limit": 20, "total": 7, "totalPages": 1 },
  "timestamp": "2024-03-15T10:00:00.000Z"
}
```

---

### GET /api/client/api/files/:id/download

Generate a short-lived, pre-signed download URL for a file.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | File ID |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Download URL ready",
  "data": {
    "url": "https://res.cloudinary.com/servixos/client-files/abc123.pdf?...",
    "expiresAt": "2024-03-15T10:05:00.000Z"
  },
  "timestamp": "2024-03-15T10:00:00.000Z"
}
```

**Errors:** `404` if file not found or does not belong to this client.

---

## ClientFile Object Reference

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `clientId` | ObjectId | |
| `filename` | string | Original file name |
| `cloudinaryPublicId` | string | Cloudinary asset identifier |
| `url` | string | Cloudinary secure URL |
| `format` | enum | `pdf` `doc` `docx` `png` `jpg` |
| `filesizeBytes` | number | File size in bytes |
| `uploadedBy` | ObjectId? | User who performed the upload |
| `deletedAt` | ISO date? | Present on soft-deleted records |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |
