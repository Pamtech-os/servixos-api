export interface CompanyLookupResult {
  found: boolean;
  registeredName?: string;
}

export interface VerifyRegistrationJobData {
  userId: string;
}

/** Subset of the Prembly response envelope this integration relies on. */
export interface PremblyResponse {
  status?: boolean;
  response_code?: string;
  data?: Record<string, unknown> | null;
}
