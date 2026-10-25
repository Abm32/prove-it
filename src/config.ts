import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(1).default('development-only-change-me'),
  DATABASE_PATH: z.string().min(1).default('data/prove-it.db'),
  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_VISION_MODEL: z.string().min(1).default('gpt-5-mini'),
  OPENAI_STT_MODEL: z.string().min(1).default('gpt-4o-mini-transcribe'),
  DARE_COST_POINTS: z.coerce.number().int().positive().default(1000),
  TICK_MS: z.coerce.number().int().positive().default(2000),
  TWITCH_EVENTSUB_WS_URL: z.string().url().default('wss://eventsub.wss.twitch.tv/ws'),
  TWITCH_EVENTSUB_SUB_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
});

export const config = envSchema.parse(process.env);
