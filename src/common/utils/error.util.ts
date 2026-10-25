/** Returns the stack trace (or message) for errors, or the string form for non-errors. */
export const formatError = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/** Returns only the message for errors. Use in warn-level logs where a stack trace is too noisy. */
export const formatErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Returns true for MongoDB duplicate-key errors (E11000). */
export const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: number }).code === 11000;
