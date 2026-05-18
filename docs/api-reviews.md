# Reviews API

Reviews let clients rate and comment on completed jobs. There are two portals:

| Portal | Base path | Auth |
|---|---|---|
| **Business** | `/api/reviews` | JWT (`aud: business`) + `X-Business-Id` |
| **Client** | `/client/api/jobs/:id/review` | JWT (`aud: client`) |

---

## Authentication

### Business portal

Required headers on every request:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

### Client portal

Required headers on every request:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <clientAccessToken>` |
| `x-timestamp` | Unix ms timestamp |
| `x-signature` | HMAC-SHA256 request signature |

The client portal does **not** use `X-Business-Id` — the business is resolved from the JWT.

---

## Business rules

- A client can only submit one review per job (`businessId + jobId` is unique).
- A review can only be submitted for a job whose status is `completed`. Attempting to review an in-progress or cancelled job returns `400`.
- A client can only review their own jobs — the job's `clientId` must match the caller's identity.
- Reviews cannot be edited or deleted once submitted.
- Submitting a review fires a background email notification to the business owner (fire-and-forget, does not affect the response).

---

## Data models

### `Review`

| Field | Type | Description |
|---|---|---|
| `_id` | `string` | MongoDB ObjectId |
| `businessId` | `string` | Owning business ObjectId |
| `clientId` | `string` | Client who submitted the review |
| `jobId` | `string` | Job being reviewed |
| `rating` | `number` | Star rating — integer `1`–`5` |
| `comment` | `string \| undefined` | Optional written feedback, max 1000 characters |

### `ReviewStats`

| Field | Type | Description |
|---|---|---|
| `average` | `number` | Mean rating across all reviews, rounded to 1 decimal place |
| `count` | `number` | Total number of reviews |
| `distribution` | `object` | Per-star counts — keys `"1"` through `"5"`, values are integers |

---

## Caching

| Endpoint | Cache strategy | TTL |
|---|---|---|
| `GET /api/reviews` | Version-counter key (invalidated on any new review) | 2 minutes |
| `GET /api/reviews/stats` | Keyed by `businessId` (invalidated on any new review) | 5 minutes |
| `GET /client/api/jobs/:id/review` | Keyed by `clientId + jobId` (invalidated on submit) | 5 minutes |

---

## Business portal

---

### GET /api/reviews

Returns a paginated list of all reviews for the business. Optionally filter by star rating.

**Query parameters**

| Param | Type | Required | Default | Constraints |
|---|---|---|---|---|
| `rating` | integer | no | — | `1`–`5` inclusive |
| `page` | integer | no | `1` | min `1` |
| `limit` | integer | no | `10` | min `1`, max `50` |

**Sample request**

```http
GET /api/reviews?page=1&limit=10
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
  "message": "Reviews retrieved successfully",
  "data": [
    {
      "_id": "664a1b2c3d4e5f6a7b8c9d01",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "clientId": "64f1a2b3c4d5e6f7a8b9c0e1",
      "jobId": "64f1a2b3c4d5e6f7a8b9c0f1",
      "rating": 5,
      "comment": "Fantastic work — arrived on time and cleaned up after."
    },
    {
      "_id": "664a1b2c3d4e5f6a7b8c9d02",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "clientId": "64f1a2b3c4d5e6f7a8b9c0e2",
      "jobId": "64f1a2b3c4d5e6f7a8b9c0f2",
      "rating": 4,
      "comment": "Good service overall."
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 28,
    "totalPages": 3
  }
}
```

**Filter by rating**

```http
GET /api/reviews?rating=5&page=1&limit=20
```

Returns only 5-star reviews.

**Empty state**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reviews retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

**Error responses**

| Status | When |
|---|---|
| `400` | `rating`, `page`, or `limit` fails validation |
| `401` | Missing or invalid access token |
| `403` | `X-Business-Id` does not match the JWT |
| `500` | Unexpected server error |

---

### GET /api/reviews/stats

Returns aggregate rating statistics for the business. Use this to populate a rating summary widget (overall score + star distribution bar chart).

**Query parameters**

None.

**Sample request**

```http
GET /api/reviews/stats
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
  "message": "Reviews retrieved successfully",
  "data": {
    "average": 4.3,
    "count": 28,
    "distribution": {
      "1": 1,
      "2": 2,
      "3": 3,
      "4": 9,
      "5": 13
    }
  }
}
```

**Empty state (no reviews yet)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reviews retrieved successfully",
  "data": {
    "average": 0,
    "count": 0,
    "distribution": {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0
    }
  }
}
```

**Notes**
- `average` is rounded to 1 decimal place. Display as e.g. `"4.3 / 5"`.
- `distribution` keys are strings (`"1"` through `"5"`) because JSON object keys are always strings.
- The sum of all `distribution` values equals `count`.

**Chart integration tip**

```ts
// Star distribution bar chart
const stars = [5, 4, 3, 2, 1] as const;
const bars = stars.map((star) => ({
  label: `${star} stars`,
  count: data.distribution[String(star)],
  percentage: data.count > 0
    ? Math.round((data.distribution[String(star)] / data.count) * 100)
    : 0,
}));
```

**Error responses**

| Status | When |
|---|---|
| `401` | Missing or invalid access token |
| `403` | `X-Business-Id` does not match the JWT |
| `500` | Unexpected server error |

---

## Client portal

---

### POST /client/api/jobs/:id/review

Submit a review for a completed job. Each job can only be reviewed once; submitting a second time returns `409`.

**Path parameters**

| Param | Type | Description |
|---|---|---|
| `id` | MongoDB ObjectId | The job being reviewed |

**Request body**

| Field | Type | Required | Constraints |
|---|---|---|---|
| `rating` | integer | yes | `1`–`5` inclusive |
| `comment` | string | no | Max 1000 characters. Leading/trailing whitespace is trimmed. |

**Sample request**

```http
POST /client/api/jobs/64f1a2b3c4d5e6f7a8b9c0f1/review
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json
x-timestamp: 1745769600000
x-signature: sha256=abc123...

{
  "rating": 5,
  "comment": "Fantastic work — arrived on time and cleaned up after."
}
```

**Minimal request (no comment)**

```json
{ "rating": 4 }
```

**Response `201`**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Review submitted successfully",
  "data": {
    "_id": "664a1b2c3d4e5f6a7b8c9d01",
    "businessId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "clientId": "64f1a2b3c4d5e6f7a8b9c0e1",
    "jobId": "64f1a2b3c4d5e6f7a8b9c0f1",
    "rating": 5,
    "comment": "Fantastic work — arrived on time and cleaned up after."
  }
}
```

**Error responses**

| Status | Message | When |
|---|---|---|
| `400` | `rating` is not an integer between 1 and 5 | Validation failure on `rating` |
| `400` | `You can only review completed jobs` | Job exists but its status is not `completed` |
| `404` | `Job not found` | Job does not exist, belongs to a different business, or belongs to a different client |
| `409` | `You have already submitted a review for this job` | A review for this job already exists |
| `401` | `Authentication required` | Missing or invalid client access token |
| `500` | `An unexpected error occurred` | Server error |

> **Why does the wrong-client case return 404 instead of 403?** To avoid leaking whether a job ID exists at all for a different client, the service returns 404 for all "job not found or not yours" cases. This is intentional.

---

### GET /client/api/jobs/:id/review

Fetches the client's own review for a specific job. Returns `404` if no review has been submitted yet.

**Path parameters**

| Param | Type | Description |
|---|---|---|
| `id` | MongoDB ObjectId | The job whose review you want to retrieve |

**Sample request**

```http
GET /client/api/jobs/64f1a2b3c4d5e6f7a8b9c0f1/review
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
x-timestamp: 1745769600000
x-signature: sha256=abc123...
```

**Response `200`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Review retrieved successfully",
  "data": {
    "_id": "664a1b2c3d4e5f6a7b8c9d01",
    "businessId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "clientId": "64f1a2b3c4d5e6f7a8b9c0e1",
    "jobId": "64f1a2b3c4d5e6f7a8b9c0f1",
    "rating": 5,
    "comment": "Fantastic work — arrived on time and cleaned up after."
  }
}
```

**Error responses**

| Status | Message | When |
|---|---|---|
| `404` | `Review not found` | No review submitted for this job, or the review belongs to a different client |
| `401` | `Authentication required` | Missing or invalid client access token |
| `500` | `An unexpected error occurred` | Server error |

---

## Common error shape

```json
{
  "success": false,
  "statusCode": 409,
  "message": "You have already submitted a review for this job"
}
```

---

## Client-side integration patterns

### Check if a job has been reviewed before showing the review form

```ts
async function fetchReview(jobId: string): Promise<Review | null> {
  const res = await api.get(`/client/api/jobs/${jobId}/review`);
  if (res.status === 404) return null;   // not yet reviewed — show form
  if (!res.ok) throw new Error(res.data.message);
  return res.data.data as Review;
}
```

### Submit a review and handle all expected error states

```ts
async function submitReview(jobId: string, rating: number, comment?: string) {
  const res = await api.post(`/client/api/jobs/${jobId}/review`, {
    rating,
    comment,
  });

  switch (res.status) {
    case 201: return res.data.data;          // success — show thank-you state
    case 400: throw new UserError(res.data.message);   // job not complete, or bad rating
    case 404: throw new UserError('Job not found');
    case 409: return fetchReview(jobId);     // already reviewed — fetch and show existing
    default:  throw new Error('Something went wrong. Please try again.');
  }
}
```

### Business portal — rating summary widget

```ts
const { data: stats } = await api.get('/api/reviews/stats');

// Overall score chip: "4.3 ★ (28 reviews)"
const scoreLabel = stats.count > 0
  ? `${stats.average} ★ (${stats.count} review${stats.count === 1 ? '' : 's'})`
  : 'No reviews yet';

// Distribution bars — render 5 → 1 so the highest star is at the top
const bars = ([5, 4, 3, 2, 1] as const).map((star) => ({
  star,
  count: stats.distribution[String(star)] as number,
  pct: stats.count > 0
    ? Math.round(((stats.distribution[String(star)] as number) / stats.count) * 100)
    : 0,
}));
```

---

## TypeScript types

Copy these interfaces directly into the frontend codebase.

```typescript
// ─── Reviews ─────────────────────────────────────────────────────────────────

interface Review {
  _id: string;
  businessId: string;
  clientId: string;
  jobId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

type StarRating = '1' | '2' | '3' | '4' | '5';

interface ReviewStats {
  /** Mean rating, 1 decimal place. 0 when no reviews exist. */
  average: number;
  count: number;
  distribution: Record<StarRating, number>;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── API response wrappers ────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

interface PaginatedApiResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}

type ReviewListResponse  = PaginatedApiResponse<Review>;
type ReviewStatsResponse = ApiResponse<ReviewStats>;
type ReviewResponse      = ApiResponse<Review>;
```

---

## Integration checklist

- [ ] Business portal: include `Authorization`, `X-Business-Id`, `x-timestamp`, `x-signature` on every request.
- [ ] Client portal: include `Authorization`, `x-timestamp`, `x-signature` — no `X-Business-Id`.
- [ ] Before rendering the review form for a job, call `GET /client/api/jobs/:id/review` first — if it returns a review, show the submitted state instead of the form.
- [ ] Handle `409` on submit by fetching and displaying the existing review rather than showing an error.
- [ ] `distribution` keys are **strings** (`"1"`–`"5"`), not numbers. Access via `distribution["5"]` not `distribution[5]`.
- [ ] `average` is `0` (not `null`) when no reviews exist — gate the score display on `count > 0`.
- [ ] `GET /api/reviews/stats` is the fast path for the rating summary card; only fetch `GET /api/reviews` when displaying the full review list.
- [ ] The `dashboard` endpoint (`GET /api/analytics/dashboard`) includes `reviewCount` — use this for the KPI card rather than fetching stats separately on the main dashboard.
