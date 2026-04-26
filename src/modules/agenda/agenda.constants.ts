export const JOBS = {
  EMAIL_VERIFICATION: 'email:verification',
  EMAIL_PASSWORD_RESET: 'email:password-reset',
  EMAIL_WELCOME: 'email:welcome',
} as const;

export type AgendaJobName = (typeof JOBS)[keyof typeof JOBS];
