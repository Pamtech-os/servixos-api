# Invoices API

Base URL: `/api/invoices`

Invoices are billing documents sent to clients. Each invoice can have multiple line items, an optional tax rate, and tracks how much has been paid.

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
| `clientId` | ObjectId | |
| `jobId` | ObjectId? | linked job |
| `invoiceNumber` | string | unique per business |
| `status` | enum | `pending` `partial` `paid` |
| `invoiceDate` | ISO date | |
| `dueDate` | ISO date? | |
| `lineItems` | array | see below |
| `taxRate` | number | `0`–`100`, default `0` |
| `totalAmount` | number | computed: sum of line items × (1 + taxRate/100) |
| `amountPaid` | number | updated automatically when payments are recorded |
| `pdfUrl` | string? | Cloudinary URL of the generated PDF |
| `sentAt` | ISO date? | when the invoice was emailed to the client |
| `timezone` | string | IANA timezone |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

### Line Item

| Field | Type | Notes |
|---|---|---|
| `description` | string | |
| `quantity` | integer | min `1` |
| `unitPrice` | number | min `0` |

`lineTotal = quantity × unitPrice`

---

## Status Flow

```
pending → partial  (when a partial payment is recorded)
pending → paid     (when total is fully paid)
partial → paid     (when remaining balance is paid)
```

Status is updated automatically when payments are posted. It can also be set manually via `PATCH /api/invoices/:id`.

---

## Endpoints

### GET /api/invoices

List invoices with optional filters.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `search` | string | no | Matches on invoice number |
| `clientId` | ObjectId | no | Filter by client |
| `status` | enum | no | `pending` `partial` `paid` |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `50` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Invoices retrieved",
  "statistics": {
    "total": 50,
    "pending": 20,
    "partial": 10,
    "paid": 20,
    "totalRevenue": 250000,
    "pendingRevenue": 80000
  },
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "clientId": "...",
      "invoiceNumber": "INV-0001",
      "status": "pending",
      "invoiceDate": "2024-03-01T00:00:00.000Z",
      "dueDate": "2024-03-31T00:00:00.000Z",
      "lineItems": [
        { "description": "Pipe repair", "quantity": 1, "unitPrice": 150 }
      ],
      "taxRate": 7.5,
      "totalAmount": 161.25,
      "amountPaid": 0,
      "pdfUrl": null,
      "sentAt": null,
      "timezone": "Africa/Lagos",
      "createdAt": "2024-03-01T09:00:00.000Z",
      "updatedAt": "2024-03-01T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

---

### GET /api/invoices/:id

Get a single invoice.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Invoice found",
  "data": { ...invoiceObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | Invoice not found |

---

### GET /api/invoices/:id/pdf

Get the PDF URL for an invoice. Generates the PDF on the fly if it does not yet exist.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "PDF ready",
  "data": {
    "pdfUrl": "https://res.cloudinary.com/.../invoice-INV-0001.pdf"
  }
}
```

---

### POST /api/invoices

Create a new invoice.

**Request body**
```json
{
  "clientId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "invoiceNumber": "INV-0001",
  "invoiceDate": "2024-03-01",
  "dueDate": "2024-03-31",
  "lineItems": [
    { "description": "Pipe repair", "quantity": 1, "unitPrice": 150 },
    { "description": "Parts", "quantity": 3, "unitPrice": 20 }
  ],
  "taxRate": 7.5,
  "jobId": "64f1a2b3c4d5e6f7a8b9c0d2"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientId` | ObjectId | yes | |
| `invoiceNumber` | string | yes | must be unique per business |
| `invoiceDate` | ISO date | yes | |
| `dueDate` | ISO date | no | |
| `lineItems` | array | yes | min 1 item |
| `lineItems[].description` | string | yes | |
| `lineItems[].quantity` | integer | yes | min `1` |
| `lineItems[].unitPrice` | number | yes | min `0` |
| `taxRate` | number | no | `0`–`100`, default `0` |
| `jobId` | ObjectId | no | link to a job |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Invoice created",
  "data": { ...invoiceObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 409 | Invoice number already exists for this business |

---

### PATCH /api/invoices/:id

Update an invoice. Only `pending` or `partial` invoices can be updated.

**Request body** (all fields optional)
```json
{
  "status": "paid",
  "dueDate": "2024-04-15",
  "lineItems": [
    { "description": "Updated service", "quantity": 2, "unitPrice": 100 }
  ],
  "taxRate": 5
}
```

| Field | Type | Notes |
|---|---|---|
| `status` | enum | `pending` `partial` `paid` |
| `dueDate` | ISO date | |
| `lineItems` | array | replaces existing items; min 1 |
| `taxRate` | number | `0`–`100` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Invoice updated",
  "data": { ...updatedInvoice }
}
```

---

### DELETE /api/invoices/:id

Soft-delete an invoice. Only `pending` invoices can be deleted.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Invoice deleted",
  "data": null
}
```

---

### POST /api/invoices/:id/send

Send the invoice to the client via email. Generates a PDF first if one does not exist. Sets `sentAt`.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Invoice sent",
  "data": { ...invoice }
}
```

---

## Computing Totals (client-side reference)

```
subtotal    = sum(item.quantity × item.unitPrice)
taxAmount   = subtotal × (taxRate / 100)
totalAmount = subtotal + taxAmount
balance     = totalAmount - amountPaid
```

---

## Permissions required

| Action | Permission |
|---|---|
| List / Get / PDF | `invoices.view` |
| Create | `invoices.create` |
| Update / Send | `invoices.edit` |
| Delete | `invoices.delete` |
