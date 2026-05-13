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

**Client portal** — all endpoints under `/client/api/files` require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <clientAccessToken>` |

---

## Business Portal

### POST /api/files/upload

Upload a file to storage and receive back the metadata needed to attach it to a resource. This is step 1 of the two-step file attach flow — the returned `url` and `publicId` are then passed to the attach endpoint (e.g. `POST /api/clients/:clientId/files`).

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

**File size limit:** 10 MB

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "File uploaded successfully",
  "data": {
    "url": "https://res.cloudinary.com/servixos/uploads/abc123.pdf",
    "publicId": "servixos/uploads/64f1a2b3/abc123",
    "filename": "site-plan.pdf",
    "mimeType": "application/pdf",
    "filesizeBytes": 204800
  }
}
```

**Errors:** `400` if no file provided, file exceeds 10 MB, or MIME type is not supported.

---

### GET /api/clients/:clientId/files

List all files attached to a specific client.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `clientId` | ObjectId | |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Files retrieved successfully",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "clientId": "64f1a2b3c4d5e6f7a8b9c0d3",
      "filename": "site-plan.pdf",
      "url": "https://res.cloudinary.com/servixos/uploads/site-plan.pdf",
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

Attach a pre-uploaded file to a client record. The file must have been uploaded first via `POST /api/files/upload`; this endpoint only records the metadata and associates the asset with the client.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `clientId` | ObjectId | |

**Content-Type:** `application/json`

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | Cloudinary URL from the upload step |
| `publicId` | string | yes | Cloudinary public ID from the upload step |
| `filename` | string | yes | Original file name |
| `mimeType` | string | yes | Must be one of the accepted MIME types above |
| `filesizeBytes` | number | yes | Must be positive |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "File uploaded successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
    "clientId": "64f1a2b3c4d5e6f7a8b9c0d3",
    "filename": "contract-draft.pdf",
    "url": "https://res.cloudinary.com/servixos/uploads/contract-draft.pdf",
    "format": "pdf",
    "filesizeBytes": 102400,
    "uploadedBy": "64f1a2b3c4d5e6f7a8b9c0d5",
    "createdAt": "2024-03-15T09:00:00.000Z",
    "updatedAt": "2024-03-15T09:00:00.000Z"
  }
}
```

**Errors:** `400` if MIME type is unsupported; `404` if client not found.

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
  "message": "File retrieved successfully",
  "data": {
    "url": "https://res.cloudinary.com/servixos/uploads/abc123.pdf"
  }
}
```

**Errors:** `404` if file not found or belongs to a different business.

---

### DELETE /api/files/:fileId

Soft-delete a file (sets `deletedAt`; the asset is also removed from Cloudinary asynchronously).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `fileId` | ObjectId | |

**Response `200`**
```json
{ "success": true, "statusCode": 200, "message": "File deleted successfully", "data": null }
```

**Errors:** `404` if not found.

---

## Client Portal

Base URL: `/client/api/files`

The client files list is an **aggregated view** — it combines invoice PDFs, contract PDFs, and message attachments into a single unified feed. File IDs are prefixed with the source type (`inv:`, `ctr:`, `msg:`) so the download endpoint knows where to resolve the asset.

---

### GET /client/api/files

List all files accessible to the authenticated client (invoices, contracts, and message attachments).

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `format` | enum | no | `pdf` `doc` `docx` `xlsx` `png` `jpg` |
| `sort` | enum | no | `generatedDate` `filename` `filesizeBytes` — default `generatedDate` |
| `order` | enum | no | `asc` `desc` — default `desc` |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `10`, max `100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Files retrieved",
  "data": [
    {
      "id": "inv:64f1a2b3c4d5e6f7a8b9c0d1",
      "filename": "INV-0042",
      "format": "pdf",
      "filesizeBytes": 0,
      "generatedDate": "2024-03-15T09:00:00.000Z"
    },
    {
      "id": "ctr:64f1a2b3c4d5e6f7a8b9c0d2",
      "filename": "Residential HVAC Service Contract",
      "format": "pdf",
      "filesizeBytes": 0,
      "generatedDate": "2024-03-10T08:00:00.000Z"
    },
    {
      "id": "msg:64f1a2b3c4d5e6f7a8b9c0d3",
      "filename": "site-plan",
      "format": "pdf",
      "filesizeBytes": 204800,
      "generatedDate": "2024-03-05T14:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1 },
  "timestamp": "2024-03-15T10:00:00.000Z"
}
```

---

### GET /client/api/files/:id/download

Resolve a download URL for a file. The `id` must be a prefixed ID from the list response (e.g. `inv:...`, `ctr:...`, `msg:...`).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | string | Prefixed file ID from the list |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Download URL ready",
  "data": {
    "downloadUrl": "https://res.cloudinary.com/servixos/uploads/abc123.pdf",
    "expiresInSeconds": 3600,
    "filename": "INV-0042.pdf"
  },
  "timestamp": "2024-03-15T10:00:00.000Z"
}
```

**Errors:** `404` if the file is not found or does not belong to this client.

---

## ClientFile Object Reference

Business-portal endpoints (`/api/clients/:clientId/files`) return `ClientFile` objects. The `cloudinaryPublicId` field is stripped from all responses.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `clientId` | ObjectId | |
| `filename` | string | Original file name |
| `url` | string | Cloudinary secure URL |
| `format` | enum | `pdf` `doc` `docx` `png` `jpg` |
| `filesizeBytes` | number | File size in bytes |
| `uploadedBy` | ObjectId? | User who performed the upload |
| `deletedAt` | ISO date? | Present on soft-deleted records |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

## ClientFileListItem Object Reference

Client-portal list endpoint returns `ClientFileListItem` objects (aggregated across invoices, contracts, and message attachments).

| Field | Type | Notes |
|---|---|---|
| `id` | string | Prefixed ID: `inv:<id>`, `ctr:<id>`, or `msg:<id>` |
| `filename` | string | Display name (no extension) |
| `format` | enum | `pdf` `doc` `docx` `xlsx` `png` `jpg` |
| `filesizeBytes` | number | `0` for invoice and contract PDFs (size unknown at generation time) |
| `generatedDate` | ISO date | Invoice date, contract sent/signed date, or message timestamp |
