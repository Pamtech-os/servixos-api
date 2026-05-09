# Payments API

Base URL: `/api/payments`

Payments record money received from clients against invoices (or as standalone entries). When a payment is posted against an invoice the invoice's `amountPaid` and `status` are updated automatically.

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
| `invoiceId` | ObjectId? | linked invoice |
| `clientId` | ObjectId? | linked client |
| `paymentDate` | ISO date | |
| `paymentMode` | enum | `cash` `bank_transfer` `credit_card` `cheque` `mobile_money` |
| `amount` | number | min `0.01` |
| `status` | enum | `completed` `partial` |
| `notes` | string? | |
| `timezone` | string | IANA timezone |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

## Endpoints

### GET /api/payments

List payments with optional filters.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `search` | string | no | |
| `status` | enum | no | `completed` `partial` |
| `paymentMode` | enum | no | `cash` `bank_transfer` `credit_card` `cheque` `mobile_money` |
| `dateFrom` | ISO date | no | Filter by payment date (inclusive) |
| `dateTo` | ISO date | no | Filter by payment date (inclusive) |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20`, max `50` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payments retrieved",
  "statistics": {
    "totalAmount": 500000,
    "completedCount": 40,
    "partialCount": 5,
    "totalCount": 45
  },
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "invoiceId": "...",
      "clientId": "...",
      "paymentDate": "2024-03-10T00:00:00.000Z",
      "paymentMode": "bank_transfer",
      "amount": 150,
      "status": "completed",
      "notes": "Paid via GTBank",
      "timezone": "Africa/Lagos",
      "createdAt": "2024-03-10T11:00:00.000Z",
      "updatedAt": "2024-03-10T11:00:00.000Z"
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

---

### GET /api/payments/:id

Get a single payment.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment found",
  "data": { ...paymentObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | Payment not found |

---

### POST /api/payments

Record a new payment. If `invoiceId` is provided:
- The invoice's `amountPaid` is incremented by `amount`.
- The invoice `status` is updated to `partial` or `paid` automatically.

**Request body**
```json
{
  "invoiceId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "clientId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "paymentDate": "2024-03-10",
  "paymentMode": "bank_transfer",
  "amount": 150,
  "status": "completed",
  "notes": "Paid via GTBank"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `invoiceId` | ObjectId | no | link to an invoice |
| `clientId` | ObjectId | no | link to a client |
| `paymentDate` | ISO date | yes | |
| `paymentMode` | enum | yes | `cash` `bank_transfer` `credit_card` `cheque` `mobile_money` |
| `amount` | number | yes | min `0.01` |
| `status` | enum | no | `completed` (default) or `partial` |
| `notes` | string | no | |

At least one of `invoiceId` or `clientId` is recommended for traceability.

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Payment recorded",
  "data": { ...paymentObject }
}
```

---

### PATCH /api/payments/:id

Update a payment record.

**Request body** (all fields optional)
```json
{
  "invoiceId": "...",
  "clientId": "...",
  "paymentDate": "2024-03-11",
  "paymentMode": "cash",
  "amount": 200,
  "status": "completed",
  "notes": "Updated"
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment updated",
  "data": { ...updatedPayment }
}
```

---

### DELETE /api/payments/:id

Soft-delete a payment. Reverses the corresponding `amountPaid` adjustment on the linked invoice.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment deleted",
  "data": null
}
```

---

## Payment Modes

| Value | Display label |
|---|---|
| `cash` | Cash |
| `bank_transfer` | Bank Transfer |
| `credit_card` | Credit Card |
| `cheque` | Cheque |
| `mobile_money` | Mobile Money |

---

## Permissions required

| Action | Permission |
|---|---|
| List / Get | `payments.view` |
| Create | `payments.create` |
| Update | `payments.edit` |
| Delete | `payments.delete` |
