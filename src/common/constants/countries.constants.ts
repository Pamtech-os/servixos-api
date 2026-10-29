/** ISO-3166-1 alpha-2 codes for the countries ServixOS currently launches in. */
export enum SupportedCountry {
  NG = 'NG',
  GB = 'GB',
  US = 'US',
  CA = 'CA',
}

// Hash set — O(1) membership checks during phone/country validation
export const SUPPORTED_COUNTRY_SET: ReadonlySet<string> = new Set(
  Object.values(SupportedCountry),
);

export const COUNTRY_CONFIG: Record<
  SupportedCountry,
  { name: string; currency: string; defaultTimezone: string }
> = {
  [SupportedCountry.NG]: {
    name: 'Nigeria',
    currency: 'NGN',
    defaultTimezone: 'Africa/Lagos',
  },
  [SupportedCountry.GB]: {
    name: 'United Kingdom',
    currency: 'GBP',
    defaultTimezone: 'Europe/London',
  },
  [SupportedCountry.US]: {
    name: 'United States',
    currency: 'USD',
    defaultTimezone: 'America/New_York',
  },
  [SupportedCountry.CA]: {
    name: 'Canada',
    currency: 'CAD',
    defaultTimezone: 'America/Toronto',
  },
};
