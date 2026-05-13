import { registerAs } from '@nestjs/config';

const SERVIXOS_ROOT_DOMAIN = 'servixos.com';

function isServixosSubdomainOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const { protocol, hostname } = parsed;
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname.endsWith(`.${SERVIXOS_ROOT_DOMAIN}`);
  } catch {
    return false;
  }
}

function resolveAllowedOrigins(): string[] {
  const explicitOrigins =
    process.env.ALLOWED_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  return explicitOrigins.length > 0
    ? explicitOrigins
    : ['http://localhost:3000'];
}

export const websocketConfig = registerAs('websocket', () => ({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowedOrigins = resolveAllowedOrigins();
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isServixosSubdomainOrigin(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-business-id',
      'x-client-token',
      'x-timestamp',
      'x-signature',
    ],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e6,
}));
