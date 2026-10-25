# Export API

Base URL: `/api/clients/:id/export`

The export module provides a way to download all data associated with a client as a structured JSON file hosted on Cloudinary.

---

## Authentication

Requires business-portal authentication.

**Required headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

---

## Endpoint

### GET /api/clients/:id/export

Export all data for a specific client.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | client ID |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data exported",
  "data": {
    "exportUrl": "https://res.cloudinary.com/your-cloud/raw/upload/servixos/client-exports/client-export-<clientId>.json"
  }
}
```

The `exportUrl` is a Cloudinary URL that resolves to a downloadable JSON file with the following structure:

```json
{
  "exportedAt": "2024-03-15T10:30:00.000Z",
  "client": {
    "id": "...",
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "+2348012345678"
  },
  "jobs": [
    {
      "id": "...",
      "title": "Pipe repair",
      "description": "Fix kitchen leak",
      "status": "completed",
      "scheduledDate": "2024-03-10T09:00:00.000Z",
      "location": "12 Main Street",
      "price": 150,
      "timezone": "Africa/Lagos"
    }
  ]
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | Client not found |
| 500 | Failed to generate or upload the export file |

---

## Notes

- The export file is uploaded to Cloudinary and the link returned. The file is publicly accessible via the URL — treat it as potentially sensitive.
- The export includes up to 1 000 jobs per client.
- Each call generates a fresh export file (overwrites any previous one for the same client).

---

## Permissions required

| Action | Permission |
|---|---|
| Export client data | `clients.view` |
