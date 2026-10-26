import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DEV_MODE: z.preprocess((value) => value === true || value === 'true', z.boolean().default(false)),
  REFEREE_MOCK: z.preprocess((value) => value === true || value === 'true', z.boolean().default(false)),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(1).default('development-only-change-me'),
  DATABASE_PATH: z.string().min(1).default('data/prove-it.db'),
  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),
  AI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
  AI_API_KEY: z.string().default(''),
  AI_VISION_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  STT_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  STT_API_KEY: z.string().default(''),
  STT_MODEL: z.string().min(1).default('whisper-large-v3-turbo'),
  FRAMES_PER_TICK: z.coerce.number().int().min(1).max(3).default(2),
  DARE_COST_POINTS: z.coerce.number().int().positive().default(1000),
  TICK_MS: z.coerce.number().int().positive().default(4000),
  TWITCH_EVENTSUB_WS_URL: z.string().url().default('wss://eventsub.wss.twitch.tv/ws'),
  TWITCH_EVENTSUB_SUB_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
});

export const config = envSchema.parse(process.env);
