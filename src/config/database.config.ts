import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  uri: process.env.DATABASE_URL || 'mongodb://localhost:27017/servixos',
}));
