import { SetMetadata } from '@nestjs/common';

export const ALLOW_LOCKED_KEY = 'allowLocked';

/** Apply to endpoints that must remain accessible when a business is LOCKED (e.g. pay-now). */
export const AllowLocked = () => SetMetadata(ALLOW_LOCKED_KEY, true);
