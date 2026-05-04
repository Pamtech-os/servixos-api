export const JOBS = {
  EMAIL_VERIFICATION: 'email:verification',
  EMAIL_PASSWORD_RESET: 'email:password-reset',
  EMAIL_WELCOME: 'email:welcome',
  EMAIL_CLIENT_CREDENTIALS: 'email:client-credentials',
  REQUEST_CLIENT_PROVISION: 'request:client-provision',
  REQUEST_ACCEPTED_CREATE_JOB: 'request:accepted:create-job',
  JOB_CONTRACT_SEND: 'job:contract:send',
} as const;

export type AgendaJobName = (typeof JOBS)[keyof typeof JOBS];
