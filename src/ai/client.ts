import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { config } from '../config.js';

let visionClient: OpenAI | undefined;
let sttClient: OpenAI | undefined;
const warningTimes = new Map<string, number>();

export function warnThrottled(key: string, message: string, error: unknown): void {
  const now = Date.now();
  const previous = warningTimes.get(key);
  if (previous !== undefined && now - previous < 60_000) return;
  warningTimes.set(key, now);
  console.warn(message, error);
}

export interface ClientEnvironment {
  AI_API_KEY?: string;
  STT_API_KEY?: string;
}

export function resolveSttKey(env: ClientEnvironment): string {
  return env.STT_API_KEY || env.AI_API_KEY || '';
}

export function getVisionClient(): OpenAI {
  if (!config.AI_API_KEY) throw new Error('AI_API_KEY is required for vision and dare parsing requests');
  visionClient ??= new OpenAI({ apiKey: config.AI_API_KEY, baseURL: config.AI_BASE_URL });
  return visionClient;
}

export function getSttClient(): OpenAI {
  const apiKey = resolveSttKey(config);
  if (!apiKey) throw new Error('STT_API_KEY or AI_API_KEY is required for transcription requests');
  sttClient ??= new OpenAI({ apiKey, baseURL: config.STT_BASE_URL });
  return sttClient;
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface CompleteJsonOptions<T> {
  client: Pick<OpenAI, 'chat'>;
  model: string;
  schema: JsonSchemaSpec;
  messages: ChatCompletionMessageParam[];
  validate: (value: unknown) => value is T;
}

export async function completeJson<T>(opts: CompleteJsonOptions<T>): Promise<T> {
  const responseFormat: OpenAI.ResponseFormatJSONSchema = {
    type: 'json_schema',
    json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
  };
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await opts.client.chat.completions.create({
      model: opts.model,
      response_format: responseFormat,
      messages: opts.messages,
    });
  } catch (error) {
    if (!isSchemaFormatRejection(error)) throw error;
    const messages = appendSchemaInstruction(opts.messages, opts.schema);
    completion = await opts.client.chat.completions.create({
      model: opts.model,
      response_format: { type: 'json_object' },
      messages,
    });
  }

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error('AI provider returned an empty result');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error('AI provider returned an invalid result');
  }
  if (!opts.validate(parsed)) throw new Error('AI provider returned an invalid result');
  return parsed;
}

function isSchemaFormatRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; message?: unknown };
  if (candidate.status !== 400 || typeof candidate.message !== 'string') return false;
  return /response_format|json_schema|strict/i.test(candidate.message);
}

function appendSchemaInstruction(messages: ChatCompletionMessageParam[], schema: JsonSchemaSpec): ChatCompletionMessageParam[] {
  const instruction = `Reply with only a JSON object matching this schema: ${JSON.stringify({ name: schema.name, schema: schema.schema })}`;
  const systemIndex = messages.findIndex((message) => message.role === 'system');
  if (systemIndex < 0) return [{ role: 'system', content: instruction }, ...messages];
  return messages.map((message, index) => index === systemIndex && message.role === 'system'
    ? { ...message, content: `${typeof message.content === 'string' ? message.content : ''}\n${instruction}` }
    : message);
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1]!.trim() : trimmed;
}
