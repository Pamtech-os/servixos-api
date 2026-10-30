import type { ConfigService } from '@nestjs/config';
import { BILLING_CONFIG_KEYS, TaxMode } from '../constants/billing.constants';

/**
 * Card-before-access is off until the trial lifecycle has been verified
 * (Stage 5). While off, new businesses keep the card-less trial.
 */
export function isPaymentMethodRequired(config: ConfigService): boolean {
  return (
    config.get<string>(BILLING_CONFIG_KEYS.REQUIRE_PAYMENT_METHOD) === 'true'
  );
}

export function getTaxMode(config: ConfigService): TaxMode {
  const mode = config.get<string>(BILLING_CONFIG_KEYS.TAX_MODE);
  return Object.values(TaxMode).includes(mode as TaxMode)
    ? (mode as TaxMode)
    : TaxMode.NONE;
}
