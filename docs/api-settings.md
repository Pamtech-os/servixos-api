# Settings API — Frontend Integration Guide

## Overview

The Settings API covers the four tabs shown in the Settings screen:

| Tab | Description | Endpoints |
|---|---|---|
| **Business** | Edit the business profile visible on invoices and client comms | `GET /settings/profile`, `PATCH /settings/profile` |
| **Notifications** | Toggle per-event email notification preferences | `GET /settings/notifications`, `PATCH /settings/notifications` |
| **Account** | Change password, delete account | `PATCH /settings/password`, `DELETE /settings/account` |
| **Subscription** | View current plan, upgrade | See [subscription-api.md](./subscription-api.md) |

---

## Base URL

```
/api/settings
```

All endpoints require business-portal authentication.

**Required headers on every request**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

---

## Standard response envelope

Every response is wrapped by the `ResponseTransformInterceptor`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "...",
  "data": { ... }
}
```

Error responses:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Human-readable error description"
}
```

---

## Business Tab

### GET /api/settings/profile

Returns the business profile fields displayed on the Business settings tab.

**Request body:** none

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Business profile retrieved successfully",
  "data": {
    "name": "Servix Solutions",
    "categoryName": "Field Services",
    "email": "info@servix.com",
    "phone": "+15555551234",
    "address": "123 Business Ave, Suite 100, New York, NY 10001",
    "description": "Professional field service management company."
  }
}
```

**Field notes**

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display name used on invoices and client communications |
| `categoryName` | string | Read-only — set during onboarding; shown as "Business Type" in the UI |
| `email` | string \| null | Business contact email |
| `phone` | string \| null | Must be a valid international phone number (E.164) |
| `address` | string \| null | Free-text address |
| `description` | string \| null | Short bio visible on the public website |

> `categoryName` is returned for display purposes only. It cannot be changed via this endpoint.

---

### PATCH /api/settings/profile

Updates editable business profile fields. All fields are optional — send only what changed.

**Request body**

```json
{
  "name": "Servix Solutions",
  "email": "info@servix.com",
  "phone": "+15555551234",
  "address": "123 Business Ave, Suite 100, New York, NY 10001",
  "description": "Professional field service management company."
}
```

**Field validation**

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | no | Non-empty string, trimmed |
| `email` | string | no | Must be a valid email address, lowercased |
| `phone` | string | no | Must be a valid E.164 international phone number |
| `address` | string | no | Free text, trimmed |
| `description` | string | no | Free text, trimmed |

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Business profile updated successfully"
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | Validation failed — `message` contains the first failing rule |
| 404 | Business not found |

**Frontend pattern — optimistic form**

```ts
// Load initial values once
const { data } = await api.get('/settings/profile');
form.setValues(data.data);

// On submit
async function saveProfile(values: ProfileForm) {
  await api.patch('/settings/profile', values);
  toast.success('Profile saved');
}
```

---

## Notifications Tab

### GET /api/settings/notifications

Returns the current notification preference toggles.

**Request body:** none

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Notification preferences retrieved successfully",
  "data": {
    "email": true,
    "newClient": true,
    "payment": false
  }
}
```

**Field notes**

| Field | Type | Default | Description |
|---|---|---|---|
| `email` | boolean | `true` | General updates and announcements via email |
| `newClient` | boolean | `true` | Alert when a new client is added to the account |
| `payment` | boolean | `true` | Alert when a payment is received or overdue |

---

### PATCH /api/settings/notifications

Saves notification preference toggles. All fields are optional — send only what changed.

**Request body**

```json
{
  "email": true,
  "newClient": true,
  "payment": false
}
```

**Field validation**

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | boolean | no | Must be `true` or `false` |
| `newClient` | boolean | no | Must be `true` or `false` |
| `payment` | boolean | no | Must be `true` or `false` |

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Notification preferences updated successfully"
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | Validation failed (value is not a boolean) |
| 404 | Business not found |

**Frontend pattern — save on toggle**

Because the UI is a list of individual toggles, you can save immediately when each toggle changes rather than waiting for an explicit submit:

```ts
async function handleToggle(key: 'email' | 'newClient' | 'payment', value: boolean) {
  // Optimistically update local state
  setPreferences(prev => ({ ...prev, [key]: value }));

  try {
    await api.patch('/settings/notifications', { [key]: value });
  } catch {
    // Roll back on failure
    setPreferences(prev => ({ ...prev, [key]: !value }));
    toast.error('Failed to save preference');
  }
}
```

---

## Account Tab

### PATCH /api/settings/password

Changes the authenticated user's password. The current password must be provided for verification. The new password must satisfy strength requirements.

**Request body**

```json
{
  "currentPassword": "OldPassword1",
  "newPassword": "NewPassword1",
  "confirmPassword": "NewPassword1"
}
```

**Field validation**

| Field | Type | Required | Rules |
|---|---|---|---|
| `currentPassword` | string | ✓ | Must match the account's current password |
| `newPassword` | string | ✓ | Min 8 chars, at least one uppercase letter, at least one number |
| `confirmPassword` | string | ✓ | Must exactly match `newPassword` |

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password updated successfully"
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 400 | Validation failed — password doesn't meet strength rules, or `confirmPassword` doesn't match |
| 401 | `currentPassword` is incorrect |
| 404 | User not found |

> Changing the password does **not** revoke existing sessions. If you want to force a re-login after a password change (recommended for security-sensitive flows), call `POST /api/auth/logout` afterward to revoke the refresh token.

**Frontend pattern**

```ts
async function handlePasswordChange(form: PasswordForm) {
  try {
    await api.patch('/settings/password', form);
    toast.success('Password updated');
    resetForm();
  } catch (err) {
    if (err.response?.status === 401) {
      setFieldError('currentPassword', 'Current password is incorrect');
    }
  }
}
```

---

### DELETE /api/settings/account

Permanently soft-deletes the business account and the owner's user record. All active sessions are revoked atomically in the same database transaction.

> **This action is irreversible.** The UI should present a confirmation dialog before calling this endpoint (see image 4 in the spec).

**Request body:** none

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Account deleted successfully"
}
```

**Error responses**

| Status | Meaning |
|---|---|
| 404 | User not found |
| 500 | Transaction failed — safe to retry once |

**What happens server-side**

The following operations run inside a MongoDB transaction:

1. `user.deletedAt` is set to `now`, `user.isActive` is set to `false`
2. `business.deletedAt` is set to `now`
3. All refresh tokens for this user are revoked

After this call succeeds the access token will still be technically valid until it expires (JWT is stateless), but all subsequent authenticated requests will fail because `TenantGuard` and `JwtAuthGuard` will not find an active business or user. **Always redirect to the login screen immediately after success.**

**Frontend pattern**

```ts
// Show confirmation dialog first
function DeleteAccountButton() {
  const [open, setOpen] = useState(false);

  async function confirmDelete() {
    await api.delete('/settings/account');
    // Clear local auth state and redirect
    auth.clearSession();
    router.replace('/login');
  }

  return (
    <>
      <button onClick={() => setOpen(true)}>Delete Account</button>
      <ConfirmDialog
        open={open}
        title="Are you sure you want to perform this action?"
        description="This will permanently delete your account and all associated data. This action cannot be undone."
        confirmLabel="Yes, Delete"
        onConfirm={confirmDelete}
        onCancel={() => setOpen(false)}
        destructive
      />
    </>
  );
}
```

---

## Subscription Tab

The Subscription tab is served entirely by the existing Subscription API. See [subscription-api.md](./subscription-api.md) for full documentation.

**Endpoints used by the Subscription tab**

| Action | Endpoint |
|---|---|
| Show current plan + status | `GET /api/me` — read `data.subscription` |
| List all available plans | `GET /api/subscription/plans` (public) |
| Upgrade plan | `POST /api/subscription/upgrade` |
| Monthly / yearly toggle | Pass `billingInterval: "monthly"` or `"yearly"` to upgrade |

---

## Loading the Settings Page

On initial mount, fetch both profile and notification data in parallel to populate all tabs without a sequential waterfall:

```ts
const [profileRes, notifRes] = await Promise.all([
  api.get('/settings/profile'),
  api.get('/settings/notifications'),
]);

const profile = profileRes.data.data;
const notifications = notifRes.data.data;
```

For the Subscription tab, `GET /api/me` is typically already in your app's global state (fetched on login), so no additional request is needed unless you need fresh data.

---

## Validation Error Shape

When any request body fails validation the API returns `400` with a message describing the first failing rule:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Phone must be a valid international phone number"
}
```

Map the `message` string to the relevant field for inline error display. For password strength failures, the messages are:

| Message | Field | Condition |
|---|---|---|
| `"Password must be at least 8 characters"` | `newPassword` | Fewer than 8 chars |
| `"Password must contain at least one uppercase letter"` | `newPassword` | No uppercase letter |
| `"Password must contain at least one number"` | `newPassword` | No digit |
| `"Passwords do not match"` | `confirmPassword` | Mismatch with `newPassword` |
| `"Incorrect password"` | `currentPassword` | Wrong current password (401, not 400) |

---

## Endpoint Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings/profile` | Required | Get business profile |
| `PATCH` | `/api/settings/profile` | Required | Update business profile |
| `GET` | `/api/settings/notifications` | Required | Get notification preferences |
| `PATCH` | `/api/settings/notifications` | Required | Update notification preferences |
| `PATCH` | `/api/settings/password` | Required | Change account password |
| `DELETE` | `/api/settings/account` | Required | Permanently delete account |
