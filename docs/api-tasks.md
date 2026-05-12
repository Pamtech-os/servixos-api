# Tasks API

The tasks module is a lightweight Kanban-style task tracker for the business team. Tasks are assigned to employees, organised into stages, and support subtasks, comments, and a full activity log.

All endpoints are business-portal only.

---

## Authentication

All endpoints require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <accessToken>` |
| `X-Business-Id` | MongoDB ObjectId of the business |
| `x-client-token` | Ephemeral session token from `GET /api/auth/client-token` |
| `x-timestamp` | Unix timestamp in milliseconds |
| `x-signature` | HMAC-SHA256 signature (see README) |

---

## REST Endpoints

Base URL: `/api/tasks`

---

### GET /api/tasks

List tasks for the business with optional filters.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `assigneeId` | ObjectId | no | Filter by assigned employee |
| `stage` | enum | no | `todo` `in_progress` `completed` |
| `priority` | enum | no | `low` `medium` `high` `urgent` |
| `dueDate` | ISO date string | no | Filter tasks due on this exact date |
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Tasks retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "businessId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "assigneeId": "64f1a2b3c4d5e6f7a8b9c0d5",
      "title": "Prepare site inspection report",
      "description": "Cover all 12 checkpoints from the checklist.",
      "stage": "in_progress",
      "priority": "high",
      "dueDate": "2024-03-20T00:00:00.000Z",
      "subtasks": [
        {
          "_id": "64f1a2b3c4d5e6f7a8b9c0e1",
          "title": "Take photos",
          "completed": true
        },
        {
          "_id": "64f1a2b3c4d5e6f7a8b9c0e2",
          "title": "Fill checklist form",
          "completed": false
        }
      ],
      "comments": [],
      "createdAt": "2024-03-15T09:00:00.000Z",
      "updatedAt": "2024-03-16T11:00:00.000Z"
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

### GET /api/tasks/:id

Get a single task by ID.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Task ID |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Task found",
  "data": { ...task }
}
```

**Errors:** `404` if not found or belongs to a different business.

---

### GET /api/tasks/:id/activities

Get the activity log for a task (audit trail of all changes, comments, and subtask updates).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Task ID |

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | Default `1` |
| `limit` | integer | no | Default `20` |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Task activities retrieved",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0f1",
      "businessId": "...",
      "taskId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "actorId": "...",
      "actorName": "Jane Doe",
      "type": "task_updated",
      "description": "Jane Doe changed stage from todo to in_progress",
      "metadata": {
        "stage": "in_progress",
        "updatedFields": ["stage"]
      },
      "createdAt": "2024-03-16T11:00:00.000Z",
      "updatedAt": "2024-03-16T11:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

**Activity types**

| `type` | When it is created |
|---|---|
| `task_created` | On `POST /api/tasks` |
| `task_updated` | On `PATCH /api/tasks/:id` |
| `task_deleted` | On `DELETE /api/tasks/:id` |
| `comment_added` | On `POST /api/tasks/:id/comments` |
| `subtask_added` | On `POST /api/tasks/:id/subtasks` |
| `subtask_updated` | On `PATCH /api/tasks/:id/subtasks/:subtaskId` |

**Errors:** `404` if task not found.

---

### POST /api/tasks

Create a new task.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | Whitespace trimmed |
| `description` | string | no | Whitespace trimmed |
| `assigneeId` | ObjectId | yes | Employee to assign the task to |
| `stage` | enum | yes | `todo` `in_progress` `completed` |
| `priority` | enum | no | `low` `medium` `high` `urgent` |
| `dueDate` | ISO date string | no | |

**Response `201`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Task created",
  "data": {
    "_id": "...",
    "businessId": "...",
    "assigneeId": "...",
    "title": "Prepare site inspection report",
    "description": "Cover all 12 checkpoints.",
    "stage": "todo",
    "priority": "high",
    "dueDate": "2024-03-20T00:00:00.000Z",
    "subtasks": [],
    "comments": [],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors:** `404` if assignee employee not found.

---

### PATCH /api/tasks/:id

Update task fields. All fields are optional.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Task ID |

**Request body** (all optional)

| Field | Type | Notes |
|---|---|---|
| `title` | string | Whitespace trimmed |
| `description` | string | Whitespace trimmed |
| `stage` | enum | `todo` `in_progress` `completed` |
| `priority` | enum | `low` `medium` `high` `urgent` |
| `dueDate` | ISO date string | |
| `assigneeId` | ObjectId | Reassign to a different employee |

**Response `200`** — updated task object. A `task_updated` activity record is created automatically.

**Errors:** `404` if task not found.

---

### DELETE /api/tasks/:id

Soft-delete a task (sets `deletedAt`).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Task ID |

**Response `200`**
```json
{ "success": true, "statusCode": 200, "message": "Task deleted", "data": null }
```

**Errors:** `404` if not found.

---

### POST /api/tasks/:id/comments

Add a comment to a task. Returns the updated task (with the new comment appended).

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Task ID |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | yes | Whitespace trimmed |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Comment added",
  "data": { ...taskWithNewComment }
}
```

**Comment object shape** (within `task.comments[]`):

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `authorId` | ObjectId | User who posted the comment |
| `authorName` | string | Display name at time of posting |
| `content` | string | |
| `createdAt` | ISO date | |

**Errors:** `404` if task not found.

---

### POST /api/tasks/:id/subtasks

Add a subtask to a task. Returns the updated task.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Task ID |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | Whitespace trimmed |

**Response `200`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Subtask added",
  "data": { ...taskWithNewSubtask }
}
```

**Subtask object shape** (within `task.subtasks[]`):

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `title` | string | |
| `completed` | boolean | `false` by default |

**Errors:** `404` if task not found.

---

### PATCH /api/tasks/:id/subtasks/:subtaskId

Toggle the completion state of a subtask.

**Path parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | ObjectId | Task ID |
| `subtaskId` | ObjectId | Subtask ID (from `task.subtasks[]._id`) |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `completed` | boolean | yes | `true` to mark complete, `false` to reopen |

**Response `200`** — updated task object. A `subtask_updated` activity record is created automatically.

**Errors:** `404` if task or subtask not found.

---

## Task Object Reference

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `assigneeId` | ObjectId | Employee the task is assigned to |
| `title` | string | |
| `description` | string? | |
| `stage` | enum | `todo` `in_progress` `completed` |
| `priority` | enum? | `low` `medium` `high` `urgent` |
| `dueDate` | ISO date? | |
| `subtasks` | Subtask[] | Embedded array |
| `comments` | TaskComment[] | Embedded array |
| `deletedAt` | ISO date? | Present on soft-deleted records |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

## TaskActivity Object Reference

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId | |
| `taskId` | ObjectId | |
| `actorId` | ObjectId | User who performed the action |
| `actorName` | string | Display name at the time of the action |
| `type` | enum | See activity types table above |
| `description` | string | Human-readable summary of the change |
| `metadata` | object? | Structured change details (see below) |
| `createdAt` | ISO date | |
| `updatedAt` | ISO date | |

**`metadata` fields**

| Field | Type | When present |
|---|---|---|
| `stage` | enum | Stage transitions |
| `assigneeId` | string | Reassignment |
| `updatedFields` | string[] | List of changed field names on update |
| `content` | string | Comment text |
| `subtaskId` | string | Subtask operations |
| `completed` | boolean | Subtask toggle |
