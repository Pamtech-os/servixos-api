export const JOBS = {
  EMAIL_VERIFICATION: 'email:verification',
  EMAIL_PASSWORD_RESET: 'email:password-reset',
  EMAIL_WELCOME: 'email:welcome',
  EMAIL_CLIENT_CREDENTIALS: 'email:client-credentials',
  EMAIL_EMPLOYEE_INVITATION: 'email:employee-invitation',
  REQUEST_CLIENT_PROVISION: 'request:client-provision',
  REQUEST_ACCEPTED_CREATE_JOB: 'request:accepted:create-job',
  JOB_CONTRACT_SEND: 'job:contract:send',
  INVOICE_SEND: 'invoice:send',
  INVOICE_AUTO_CREATE_PAYMENT: 'invoice:auto-create-payment',
  ACTIVITY_LOG_WRITE: 'activity-log:write',
  TASK_STAGES_BOOTSTRAP: 'tasks:stages:bootstrap',
  EMAIL_TASK_ASSIGNED: 'email:task:assigned',
  EMAIL_TASK_UPDATED_ASSIGNEE: 'email:task:updated:assignee',
  EMAIL_TASK_UPDATED_ACTOR: 'email:task:updated:actor',
  EMAIL_TASK_OVERDUE: 'email:task:overdue',
  TASK_OVERDUE_NOTIFICATION: 'task:overdue:notification',
  CLIENT_REQUESTS_CLEANUP: 'client:requests:cleanup',
} as const;

export type AgendaJobName = (typeof JOBS)[keyof typeof JOBS];
