export const AppEnvironment = {
  PRODUCTION: 'production',
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  TEST: 'test',
} as const;

export type AppEnvironmentValue =
  (typeof AppEnvironment)[keyof typeof AppEnvironment];
