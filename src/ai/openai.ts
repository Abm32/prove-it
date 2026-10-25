import OpenAI from 'openai';
import { config } from '../config.js';

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for AI requests');
    client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return client;
}
