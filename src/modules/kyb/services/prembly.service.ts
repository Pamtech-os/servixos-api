import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportedCountry } from 'src/common/constants/countries.constants';
import type { CompanyLookupResult, PremblyResponse } from '../types/kyb.types';

const VERIFICATION_PATH = '/api/v1/biometrics/merchant/data/verification';
const REQUEST_TIMEOUT_MS = 10_000;
const FOUND_RESPONSE_CODE = '00';
const NIGERIA_COMPANY_TYPES = new Set(['RC', 'BN', 'IT']);

/** Thin HTTP client for Prembly (IdentityPass) company registry lookups. */
@Injectable()
export class PremblyService {
  private readonly baseUrl: string;
  private readonly appId?: string;
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.baseUrl =
      config.get<string>('PREMBLY_BASE_URL') ||
      'https://api.myidentitypass.com';
    // this.appId = config.get<string>('PREMBLY_APP_ID');
    this.apiKey = config.get<string>('PREMBLY_API_KEY');
  }

  get isConfigured(): boolean {
    // return !!this.appId && !!this.apiKey;
    return !!this.apiKey;
  }

  /**
   * Looks up a company by registration number in the given country's registry.
   * Nigeria uses the CAC endpoint; other countries use the global company search.
   * Throws on transport or non-2xx errors so callers can distinguish "not found" from "unavailable".
   */
  async lookupCompany(
    country: SupportedCountry,
    registrationNumber: string,
    reference: string,
  ): Promise<CompanyLookupResult> {
    const response =
      country === SupportedCountry.NG
        ? await this.post('/cac', this.buildCacBody(registrationNumber))
        : await this.post('/global/company', {
            country_code: country,
            company_number: registrationNumber,
            customer_reference: reference,
            customer_name: 'ServixOS',
          });

    const found =
      response.status === true &&
      (response.response_code ?? FOUND_RESPONSE_CODE) === FOUND_RESPONSE_CODE;

    return {
      found,
      registeredName: found ? this.extractName(response.data) : undefined,
    };
  }

  /** CAC numbers are often entered with their type prefix, e.g. "RC123456" or "BN-998877". */
  private buildCacBody(registrationNumber: string): Record<string, string> {
    const match = /^([A-Z]{2})-?(\d+)$/.exec(registrationNumber.toUpperCase());
    if (match && NIGERIA_COMPANY_TYPES.has(match[1])) {
      return { company_type: match[1], rc_number: match[2] };
    }
    return { company_type: 'RC', rc_number: registrationNumber };
  }

  private extractName(data: PremblyResponse['data']): string | undefined {
    if (!data) return undefined;
    const name = data['company_name'] ?? data['companyName'] ?? data['name'];
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  }

  private async post(
    path: string,
    body: Record<string, string>,
  ): Promise<PremblyResponse> {
    const res = await fetch(`${this.baseUrl}${VERIFICATION_PATH}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey ?? '',
        'app-id': this.appId ?? '',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // Prembly returns 4xx with status:false for "record not found" — treat those as a valid answer
    if (res.status >= 500) {
      throw new Error(`Prembly ${path} responded with HTTP ${res.status}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Prembly ${path} rejected credentials (HTTP ${res.status})`,
      );
    }

    return (await res.json()) as PremblyResponse;
  }
}
