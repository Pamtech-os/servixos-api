import { SetMetadata } from '@nestjs/common';

export const ENCRYPT_KEY = 'useEncryption';

/**
 * Apply to a controller method to enable AES-256-GCM encryption
 * for both the incoming request body and the outgoing response data.
 *
 * @example
 * @Post('login')
 * @Encrypt()
 * async login(@Body() dto: LoginDto) { ... }
 */
export const Encrypt = () => SetMetadata(ENCRYPT_KEY, true);
