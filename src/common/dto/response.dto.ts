export class PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ServiceResponse<T = unknown> {
  message: string;
  data?: T;
  meta?: PaginationMeta;
  statistics?: Record<string, number>;
}

export class ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  statistics?: Record<string, number>;
  /** Machine-readable error code (errors only), e.g. ONBOARDING_INCOMPLETE. */
  code?: string;
  /** Structured error context (errors only), e.g. which sections are missing. */
  details?: Record<string, unknown>;
}
