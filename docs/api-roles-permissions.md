# Roles & Permissions API

Base URLs:
- `/api/roles` — role CRUD
- `/api/permissions` — list available permissions

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

## Overview

Every business starts with three **system roles** that are seeded at account creation and cannot be deleted:

| Role | Notes |
|---|---|
| **Owner** | All permissions; permissions cannot be edited |
| **Manager** | Broad access except delete and settings-edit |
| **Employee** | Read-only for most resources, can edit own jobs |

Custom roles can be created with any subset of the available permissions.

---

## Data Model — Role

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `name` | string | unique per business, max 60 chars |
| `permissions` | string[] | subset of `ALL_PERMISSIONS` |
| `isSystem` | boolean | `true` for Owner / Manager / Employee — cannot be deleted |
| `isOwnerRole` | boolean | `true` only for Owner — permissions cannot be edited |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

---

## Available Permissions

```
dashboard.view

clients.view       clients.create     clients.edit       clients.delete
invoices.view      invoices.create    invoices.edit      invoices.delete
jobs.view          jobs.create        jobs.edit          jobs.delete
contracts.view     contracts.create   contracts.edit     contracts.delete
roles.view         roles.create       roles.edit         roles.delete
payments.view      payments.create    payments.edit      payments.delete
employees.view     employees.create   employees.edit     employees.delete
requests.view      requests.create    requests.edit      requests.delete
tasks.view         tasks.create       tasks.edit         tasks.delete
analytics.view
settings.view      settings.edit
```

---

## Endpoints

### GET /api/permissions

List all available permission strings. No business context is needed — the same permissions apply globally.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Permissions retrieved",
  "data": [
    "dashboard.view",
    "clients.view",
    "clients.create",
    "..."
  ]
}
```

---

### GET /api/roles

List all roles for the authenticated business (system + custom).

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Roles retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "...",
      "name": "Owner",
      "permissions": ["dashboard.view", "clients.view", "..."],
      "isSystem": true,
      "isOwnerRole": true,
      "createdAt": "...",
      "updatedAt": "..."
    },
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
      "name": "Technician",
      "permissions": ["dashboard.view", "jobs.view", "jobs.edit"],
      "isSystem": false,
      "isOwnerRole": false,
      ...
    }
  ]
}
```

---

### GET /api/roles/:id

Get a single role.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Role found",
  "data": { ...roleObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | Role not found |

---

### POST /api/roles

Create a new custom role.

**Request body**
```json
{
  "name": "Technician",
  "permissions": [
    "dashboard.view",
    "jobs.view",
    "jobs.edit",
    "clients.view"
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | max 60 chars, unique per business |
| `permissions` | string[] | yes | must be values from `ALL_PERMISSIONS`; duplicates rejected |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Role created",
  "data": { ...roleObject }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 409 | Role name already exists for this business |
| 400 | Invalid permission string in the array |

---

### PATCH /api/roles/:id

Update a custom role's name or permissions. Cannot update system roles; the Owner role's permissions are immutable.

**Request body** (all fields optional)
```json
{
  "name": "Senior Technician",
  "permissions": [
    "dashboard.view",
    "jobs.view",
    "jobs.edit",
    "jobs.create",
    "clients.view"
  ]
}
```

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Role updated",
  "data": { ...updatedRole }
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 403 | Cannot edit the Owner role's permissions |
| 403 | Cannot rename a system role |

---

### DELETE /api/roles/:id

Delete a custom role. System roles (`isSystem: true`) cannot be deleted.

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Role deleted",
  "data": null
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 403 | Cannot delete a system role |
| 409 | Role is currently assigned to one or more employees |

---

## Default Role Permissions Reference

### Owner
All permissions (see full list above).

### Manager
```
dashboard.view
clients.view, clients.create, clients.edit
invoices.view, invoices.create, invoices.edit
jobs.view, jobs.create, jobs.edit
contracts.view, contracts.create, contracts.edit
payments.view, payments.create, payments.edit
employees.view, employees.create, employees.edit
requests.view, requests.create, requests.edit
tasks.view, tasks.create, tasks.edit
analytics.view
settings.view
```

### Employee
```
dashboard.view
clients.view
jobs.view, jobs.edit
contracts.view
payments.view
requests.view
tasks.view
```

---

## Permissions required to manage roles

| Action | Permission |
|---|---|
| List / Get | `roles.view` |
| Create | `roles.create` |
| Update | `roles.edit` |
| Delete | `roles.delete` |
