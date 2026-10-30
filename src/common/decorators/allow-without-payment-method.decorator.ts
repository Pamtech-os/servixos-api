import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_PAYMENT_METHOD_KEY = 'allowWithoutPaymentMethod';

/** Routes reachable before the owner has added a card and started the trial (billing, dashboard shell). */
export const AllowWithoutPaymentMethod = () =>
  SetMetadata(ALLOW_WITHOUT_PAYMENT_METHOD_KEY, true);
