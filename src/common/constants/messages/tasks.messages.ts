export const TASKS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Task created successfully',
    RETRIEVED: 'Tasks retrieved successfully',
    FOUND: 'Task retrieved successfully',
    UPDATED: 'Task updated successfully',
    DELETED: 'Task deleted successfully',
    COMMENT_ADDED: 'Comment added successfully',
    SUBTASK_ADDED: 'Subtask added successfully',
    SUBTASK_UPDATED: 'Subtask updated successfully',
  },
  ERROR: {
    NOT_FOUND: 'Task not found',
    SUBTASK_NOT_FOUND: 'Subtask not found',
    ASSIGNEE_NOT_FOUND: 'Assigned employee not found',
  },
} as const;
