import { registerAs } from '@nestjs/config';

export const websocketConfig = registerAs('websocket', () => ({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
    ],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e6,
}));
