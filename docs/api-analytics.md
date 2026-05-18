# Analytics API

Base URL: `/api/analytics`

The Analytics API provides read-only aggregated statistics for the business portal. All four endpoints are independently cacheable, so they can be fetched in parallel on page load to achieve the lowest possible dashboard render time.

---

## Authentication

All endpoints require business-portal authentication.

**Required headers on every request**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-timestamp` | Unix ms timestamp (current time) |
| `x-signature` | HMAC-SHA256 request signature |

---

## Caching

All responses are served from Redis cache when available. Stale data clears automatically — the frontend does not need to send any cache-control headers.

| Endpoint | Cache TTL |
|---|---|
| `GET /analytics/traffic` | 10 minutes (keyed by businessId + date range) |
| `GET /analytics/revenue` | 10 minutes (keyed by businessId + months) |
| `GET /analytics/jobs` | 5 minutes (keyed by businessId) |
| `GET /analytics/dashboard` | 5 minutes (keyed by businessId) |

**Tip:** Fetch all four endpoints in parallel on dashboard load. Because they are independently cached, the total wait time equals the slowest single response, not the sum of all four.

```js
// Recommended parallel fetch pattern
const [traffic, revenue, jobs, dashboard] = await Promise.all([
  fetch('/api/analytics/traffic'),
  fetch('/api/analytics/revenue'),
  fetch('/api/analytics/jobs'),
  fetch('/api/analytics/dashboard'),
]);
```

---

## Data Models

### `DailyTrafficPoint`

| Field | Type | Description |
|---|---|---|
| `date` | `string` | ISO date (`YYYY-MM-DD`) in the business's local timezone |
| `visitors` | `number` | Unique visitors that day (counted by distinct `sessionId`) |
| `pageViews` | `number` | Total page view events that day |

### `TopPage`

| Field | Type | Description |
|---|---|---|
| `page` | `string` | Relative URL path e.g. `"/"` or `"/services"` |
| `views` | `number` | Total views for this page in the queried period |
| `percentage` | `number` | Share of total page views e.g. `45.2` |

### `TrafficStats`

| Field | Type | Description |
|---|---|---|
| `totalVisitors` | `number` | Sum of unique visitors across all days |
| `totalPageViews` | `number` | Total page view events in the period |
| `dailyAverage` | `number` | Mean page views per day over the period |
| `conversionRate` | `number` | `(service requests / unique visitors) × 100` — a proxy for how many website visitors submitted a service request |

### `MonthlyRevenuePoint`

| Field | Type | Description |
|---|---|---|
| `month` | `string` | Month key `YYYY-MM` e.g. `"2026-04"` |
| `revenue` | `number` | Sum of all payment amounts in this month (2 decimal places) |
| `count` | `number` | Number of individual payments collected |

### `JobStatusPoint`

| Field | Type | Description |
|---|---|---|
| `status` | `string` | One of `pending` `in_progress` `completed` `cancelled` |
| `count` | `number` | Number of jobs with this status |
| `percentage` | `number` | Share of total jobs e.g. `22.5` |

### `OutstandingInvoices`

| Field | Type | Description |
|---|---|---|
| `count` | `number` | Number of invoices with status `pending` or `partial` |
| `totalAmount` | `number` | Sum of remaining balance (`totalAmount − amountPaid`) across those invoices |

### `RecentActivity`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Activity log entry ID |
| `actorName` | `string` | Name of the employee who performed the action |
| `actorRole` | `string` | Role of the actor |
| `action` | `string` | Human-readable description e.g. `"Created invoice INV-0042"` |
| `category` | `string` | One of `auth` `client` `job` `invoice` `payment` `settings` `role` `employee` `task` `request` `website` |
| `timestamp` | `ISO date` | When the action occurred (business-local time) |

### `TopClient`

| Field | Type | Description |
|---|---|---|
| `clientId` | `string` | Client ObjectId |
| `name` | `string` | Client display name |
| `email` | `string` | Client email address |
| `totalSpent` | `number` | Cumulative payment amount across all time (2 decimal places) |

---

## Endpoints

---

### GET /api/analytics/traffic

Returns daily website traffic data for the business's published website over a configurable date range.

**Query parameters**

| Param | Type | Required | Default | Constraints |
|---|---|---|---|---|
| `dateFrom` | ISO date string (`YYYY-MM-DD`) | no | 7 days ago | Must be a valid calendar date |
| `dateTo` | ISO date string (`YYYY-MM-DD`) | no | today | Must be a valid calendar date |

**Notes**
- Dates are interpreted as full calendar days in UTC (`dateFrom` starts at `00:00:00 UTC`, `dateTo` ends at `23:59:59 UTC`).
- Daily data points are grouped by the **business's local timezone**, so a visitor at 11 PM local time is counted on the correct local date, not the next UTC date.
- `visitors` counts unique `sessionId` values per day. A visitor without a session cookie counts towards `pageViews` but not `visitors`.
- `conversionRate` will be `0` until the website traffic tracking endpoint is live and receiving data.
- `topPages` is capped at 10 entries, sorted by views descending.
- The `percentage` on each top-page entry is relative to the **total page views in the queried period**, not to all pages ever.

**Sample request**

```http
GET /api/analytics/traffic?dateFrom=2026-04-01&dateTo=2026-04-30
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
X-Business-Id: 64f1a2b3c4d5e6f7a8b9c0d1
x-timestamp: 1745769600000
x-signature: sha256=abc123...
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Traffic analytics retrieved successfully",
  "data": {
    "trafficData": [
      { "date": "2026-04-01", "visitors": 34, "pageViews": 98 },
      { "date": "2026-04-02", "visitors": 41, "pageViews": 115 },
      { "date": "2026-04-03", "visitors": 28, "pageViews": 76 },
      { "date": "2026-04-04", "visitors": 52, "pageViews": 160 },
      { "date": "2026-04-05", "visitors": 47, "pageViews": 142 }
    ],
    "topPages": [
      { "page": "/",          "views": 420, "percentage": 45.2 },
      { "page": "/services",  "views": 310, "percentage": 33.4 },
      { "page": "/contact",   "views": 145, "percentage": 15.6 },
      { "page": "/about",     "views":  54, "percentage":  5.8 }
    ],
    "stats": {
      "totalVisitors": 1240,
      "totalPageViews": 3800,
      "dailyAverage": 126.67,
      "conversionRate": 3.5
    }
  }
}
```

**Default range (no params)**

```http
GET /api/analytics/traffic
```

Returns the last 7 days including today. The `dateFrom` and `dateTo` values default server-side, so the cache key is stable for the same day.

**Error responses**

| Status | Code | Message |
|---|---|---|
| 400 | `BAD_REQUEST` | `dateFrom` or `dateTo` is not a valid ISO date string |
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 403 | `FORBIDDEN` | X-Business-Id does not match the JWT |
| 500 | `INTERNAL_SERVER_ERROR` | `"Unable to retrieve analytics data at this time"` |

---

### GET /api/analytics/revenue

Returns monthly revenue buckets for the last N calendar months, grouped by the business's local timezone.

**Query parameters**

| Param | Type | Required | Default | Constraints |
|---|---|---|---|---|
| `months` | integer | no | `7` | min `1`, max `24` |

**Notes**
- `months=7` returns the current month plus the 6 preceding months (7 buckets total).
- Months with **zero revenue** are included with `revenue: 0` and `count: 0` so the chart series is always continuous — no client-side gap filling is needed.
- `revenue` values are rounded to 2 decimal places.
- Month keys use the format `YYYY-MM` (sortable as strings).
- The result is always sorted chronologically (oldest first), making it safe to map directly to a chart's x-axis.

**Sample request**

```http
GET /api/analytics/revenue?months=6
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
X-Business-Id: 64f1a2b3c4d5e6f7a8b9c0d1
x-timestamp: 1745769600000
x-signature: sha256=abc123...
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Revenue data retrieved successfully",
  "data": [
    { "month": "2025-11", "revenue": 4200.00,  "count": 11 },
    { "month": "2025-12", "revenue": 6850.50,  "count": 18 },
    { "month": "2026-01", "revenue": 3100.00,  "count":  8 },
    { "month": "2026-02", "revenue":    0.00,  "count":  0 },
    { "month": "2026-03", "revenue": 7420.75,  "count": 20 },
    { "month": "2026-04", "revenue": 5980.25,  "count": 14 }
  ]
}
```

**Chart integration tip**

```js
// Map directly to a recharts / chart.js dataset
const labels  = data.map(d => d.month);           // ["2025-11", "2025-12", ...]
const revenue = data.map(d => d.revenue);          // [4200, 6850.50, ...]
const counts  = data.map(d => d.count);            // [11, 18, ...]
```

**Error responses**

| Status | Code | Message |
|---|---|---|
| 400 | `BAD_REQUEST` | `months` is not an integer, or is outside 1–24 |
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 403 | `FORBIDDEN` | X-Business-Id does not match the JWT |
| 500 | `INTERNAL_SERVER_ERROR` | `"Unable to retrieve analytics data at this time"` |

---

### GET /api/analytics/jobs

Returns the distribution of all non-deleted jobs across the four job statuses.

**Query parameters**

None.

**Notes**
- All four statuses are **always returned**, even when the count is `0`. This guarantees the chart always has a fixed, predictable series length.
- `percentage` values sum to `100` (within floating-point precision). When there are no jobs at all, all percentages are `0`.
- `percentage` is rounded to 2 decimal places.
- This endpoint counts **all jobs ever** for the business (not filtered by date). Use the date filters on `GET /api/jobs` if you need a date-scoped count.

**Sample request**

```http
GET /api/analytics/jobs
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
X-Business-Id: 64f1a2b3c4d5e6f7a8b9c0d1
x-timestamp: 1745769600000
x-signature: sha256=abc123...
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Jobs analytics retrieved successfully",
  "data": [
    { "status": "pending",     "count": 18, "percentage": 14.29 },
    { "status": "in_progress", "count": 24, "percentage": 19.05 },
    { "status": "completed",   "count": 76, "percentage": 60.32 },
    { "status": "cancelled",   "count":  8, "percentage":  6.35 }
  ]
}
```

**Empty state (no jobs yet)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Jobs analytics retrieved successfully",
  "data": [
    { "status": "pending",     "count": 0, "percentage": 0 },
    { "status": "in_progress", "count": 0, "percentage": 0 },
    { "status": "completed",   "count": 0, "percentage": 0 },
    { "status": "cancelled",   "count": 0, "percentage": 0 }
  ]
}
```

**Chart integration tip**

```js
// Donut / pie chart dataset
const labels  = data.map(d => d.status);       // ["pending", "in_progress", ...]
const counts  = data.map(d => d.count);         // [18, 24, 76, 8]
const percents = data.map(d => d.percentage);   // [14.29, 19.05, 60.32, 6.35]

// Recommended colour mapping
const STATUS_COLORS = {
  pending:     '#f59e0b',   // amber
  in_progress: '#3b82f6',   // blue
  completed:   '#22c55e',   // green
  cancelled:   '#ef4444',   // red
};
```

**Error responses**

| Status | Code | Message |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 403 | `FORBIDDEN` | X-Business-Id does not match the JWT |
| 500 | `INTERNAL_SERVER_ERROR` | `"Unable to retrieve analytics data at this time"` |

---

### GET /api/analytics/dashboard

Returns all dashboard summary statistics in a single request. Use this endpoint to populate the main dashboard screen without making multiple round-trips.

**Query parameters**

None.

**Notes**
- All six internal aggregations run concurrently server-side — total response time equals the slowest sub-query, not the sum.
- `monthlyRevenue` is the sum of payments with a `paymentDate` that falls within the **current UTC calendar month**.
- `activeClientsCount` counts clients who have at least one job with status `pending` or `in_progress`. Clients with only `completed` or `cancelled` jobs are not included.
- `outstandingInvoices.totalAmount` is the sum of remaining balances (`totalAmount − amountPaid`) across all `pending` and `partial` invoices. It is not the sum of total invoice amounts.
- `reviewCount` is the total number of reviews submitted for this business across all jobs.
- `recentActivity` returns the 5 most recent entries, sorted newest first.
- `topClients` returns up to 5 clients sorted by total lifetime spend descending. Clients whose records have been deleted are excluded.
- All monetary values (`monthlyRevenue`, `outstandingInvoices.totalAmount`, `topClients[].totalSpent`) are rounded to 2 decimal places.

**Sample request**

```http
GET /api/analytics/dashboard
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
X-Business-Id: 64f1a2b3c4d5e6f7a8b9c0d1
x-timestamp: 1745769600000
x-signature: sha256=abc123...
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Dashboard statistics retrieved successfully",
  "data": {
    "monthlyRevenue": 12400.50,
    "activeClientsCount": 23,
    "outstandingInvoices": {
      "count": 7,
      "totalAmount": 4350.00
    },
    "reviewCount": 28,
    "recentActivity": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "actorName": "Aisha Mohammed",
        "actorRole": "Technician",
        "action": "Marked job #JOB-0041 as completed",
        "category": "job",
        "timestamp": "2026-04-30T14:22:00.000Z"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d2",
        "actorName": "Emeka Obi",
        "actorRole": "Admin",
        "action": "Sent invoice INV-0089 to client",
        "category": "invoice",
        "timestamp": "2026-04-30T11:05:00.000Z"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d3",
        "actorName": "Emeka Obi",
        "actorRole": "Admin",
        "action": "Created client Acme Corp",
        "category": "client",
        "timestamp": "2026-04-30T09:48:00.000Z"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "actorName": "Fatima Yusuf",
        "actorRole": "Manager",
        "action": "Recorded payment of ₦25,000 for invoice INV-0082",
        "category": "payment",
        "timestamp": "2026-04-29T16:30:00.000Z"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d5",
        "actorName": "Aisha Mohammed",
        "actorRole": "Technician",
        "action": "Started job #JOB-0040",
        "category": "job",
        "timestamp": "2026-04-29T08:15:00.000Z"
      }
    ],
    "topClients": [
      {
        "clientId": "64f1a2b3c4d5e6f7a8b9c0e1",
        "name": "Acme Corp",
        "email": "billing@acmecorp.com",
        "totalSpent": 58400.00
      },
      {
        "clientId": "64f1a2b3c4d5e6f7a8b9c0e2",
        "name": "Bright Solutions Ltd",
        "email": "accounts@bright.ng",
        "totalSpent": 34250.75
      },
      {
        "clientId": "64f1a2b3c4d5e6f7a8b9c0e3",
        "name": "James Okafor",
        "email": "james.okafor@gmail.com",
        "totalSpent": 21800.00
      },
      {
        "clientId": "64f1a2b3c4d5e6f7a8b9c0e4",
        "name": "Verde Homes",
        "email": "finance@verdehomes.com",
        "totalSpent": 17500.50
      },
      {
        "clientId": "64f1a2b3c4d5e6f7a8b9c0e5",
        "name": "Kunle Adeyemi",
        "email": "kadeyemi@outlook.com",
        "totalSpent": 9800.25
      }
    ]
  }
}
```

**Empty state (new business, no data yet)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Dashboard statistics retrieved successfully",
  "data": {
    "monthlyRevenue": 0,
    "activeClientsCount": 0,
    "outstandingInvoices": {
      "count": 0,
      "totalAmount": 0
    },
    "reviewCount": 0,
    "recentActivity": [],
    "topClients": []
  }
}
```

**Activity `category` values**

| Value | When it appears |
|---|---|
| `auth` | Login, logout, PIN changes |
| `client` | Client created, updated, deleted |
| `job` | Job created, status changed, completed |
| `invoice` | Invoice created, sent, marked paid |
| `payment` | Payment recorded |
| `settings` | Business profile changes |
| `role` | Role or permission changes |
| `employee` | Employee invited, updated, deactivated |
| `task` | Task created, completed, assigned |
| `request` | Service request accepted or rejected |
| `website` | Website generated or published |

**Error responses**

| Status | Code | Message |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 403 | `FORBIDDEN` | X-Business-Id does not match the JWT |
| 500 | `INTERNAL_SERVER_ERROR` | `"Unable to retrieve analytics data at this time"` |

---

## Website Traffic Tracking

The traffic analytics endpoints read data from the `page_views` collection. For traffic data to appear, the frontend must record a page view event every time a visitor loads a page on the business's published website.

> **Status:** The tracking write endpoint (`POST /api/analytics/track` or similar) is not yet implemented. This section describes the expected integration contract so the frontend can be prepared.

### How tracking will work

When implemented, the tracking endpoint will accept:

| Field | Type | Required | Notes |
|---|---|---|---|
| `page` | string | yes | Relative path of the visited page e.g. `"/"`, `"/services"` |
| `sessionId` | string | no | A UUID generated once per browser session (stored in `sessionStorage`). Required for unique-visitor counting. |
| `referrer` | string | no | `document.referrer` if present |

**Recommended client-side session ID generation**

```js
function getSessionId() {
  const key = 'svx_sid';
  let sid = sessionStorage.getItem(key);
  if (!sid) {
    // crypto.randomUUID is available in all modern browsers
    sid = crypto.randomUUID();
    sessionStorage.setItem(key, sid);
  }
  return sid;
}

// Call on every page navigation
async function trackPageView(businessId) {
  await fetch(`/api/analytics/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: window.location.pathname,
      sessionId: getSessionId(),
      referrer: document.referrer || undefined,
    }),
  });
}
```

`sessionStorage` clears when the tab is closed, which matches the common industry definition of "a session". A returning visitor in a new tab/window counts as a new visitor.

---

## Common Error Shape

All errors follow the standard `ApiResponse` envelope:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "dateFrom must be a valid ISO 8601 date string (YYYY-MM-DD)"
}
```

### Validation error (400)

Returned when a query parameter fails DTO validation.

```json
{
  "success": false,
  "statusCode": 400,
  "message": "months must be a whole number"
}
```

### Unauthorised (401)

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Authentication required"
}
```

### Forbidden (403)

Returned when `X-Business-Id` does not match the `businessId` in the JWT claim.

```json
{
  "success": false,
  "statusCode": 403,
  "message": "Access denied"
}
```

### Internal error (500)

```json
{
  "success": false,
  "statusCode": 500,
  "message": "Unable to retrieve analytics data at this time"
}
```

---

## TypeScript Types

Copy these interfaces directly into the frontend codebase.

```typescript
// ─── Traffic ─────────────────────────────────────────────────────────────────

interface DailyTrafficPoint {
  date: string;         // "YYYY-MM-DD" in business-local time
  visitors: number;
  pageViews: number;
}

interface TopPage {
  page: string;         // e.g. "/" or "/services"
  views: number;
  percentage: number;   // e.g. 45.2
}

interface TrafficStats {
  totalVisitors: number;
  totalPageViews: number;
  dailyAverage: number;
  conversionRate: number;
}

interface TrafficAnalytics {
  trafficData: DailyTrafficPoint[];
  topPages: TopPage[];
  stats: TrafficStats;
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

interface MonthlyRevenuePoint {
  month: string;        // "YYYY-MM"
  revenue: number;      // 2 decimal places
  count: number;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

type JobStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

interface JobStatusPoint {
  status: JobStatus;
  count: number;
  percentage: number;   // 2 decimal places
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type ActivityCategory =
  | 'auth' | 'client' | 'job' | 'invoice' | 'payment'
  | 'settings' | 'role' | 'employee' | 'task' | 'request' | 'website';

interface RecentActivity {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  category: ActivityCategory;
  timestamp: string;    // ISO date string
}

interface TopClient {
  clientId: string;
  name: string;
  email: string;
  totalSpent: number;   // 2 decimal places
}

interface OutstandingInvoices {
  count: number;
  totalAmount: number;  // remaining balance, 2 decimal places
}

interface DashboardStats {
  monthlyRevenue: number;         // current UTC month, 2 dp
  activeClientsCount: number;
  outstandingInvoices: OutstandingInvoices;
  reviewCount: number;            // total reviews submitted for this business
  recentActivity: RecentActivity[];
  topClients: TopClient[];
}

// ─── API Response wrappers ───────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

type TrafficResponse  = ApiResponse<TrafficAnalytics>;
type RevenueResponse  = ApiResponse<MonthlyRevenuePoint[]>;
type JobsResponse     = ApiResponse<JobStatusPoint[]>;
type DashboardResponse = ApiResponse<DashboardStats>;
```

---

## Integration Checklist

- [ ] Include `Authorization`, `X-Business-Id`, `x-timestamp`, and `x-signature` headers on every request.
- [ ] Fetch all four endpoints in parallel (`Promise.all`) on dashboard mount.
- [ ] Handle the empty state — all counts may be `0` and arrays may be empty for a brand-new business.
- [ ] `trafficData` days may be sparse (gaps in the array are not possible — every day in the range is returned). However, if `pageViews` is `0` across all days, the business website has no tracking data yet — show an onboarding prompt instead of an empty chart.
- [ ] Revenue `data` array is always the full requested month range (zero-filled). Safe to map directly to chart labels without gap-checking.
- [ ] Jobs `data` array always has exactly 4 entries (all statuses). Safe to destructure by index or find by `status`.
- [ ] Cache TTLs are server-side only — do not add client-side cache headers or you may serve data that is older than the server TTL.
- [ ] `reviewCount` is live — use it for the reviews KPI card on the dashboard. For the full breakdown (average, distribution), call `GET /api/reviews/stats` separately.
- [ ] `timestamp` in `recentActivity` is an ISO 8601 UTC string — convert to business-local time before display using the business's `timezone` field from the business profile.
- [ ] For the traffic `conversionRate`, display `0.00%` with a tooltip explaining it tracks website-to-request conversions, until tracking data begins flowing.
