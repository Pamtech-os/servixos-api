import { registerAs } from '@nestjs/config';

export const aiConfig = registerAs('ai', () => ({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  websiteModel: process.env.AI_WEBSITE_MODEL || 'claude-opus-4-7',
  contractModel: process.env.AI_CONTRACT_MODEL || 'claude-opus-4-7',
}));
