import { config } from '../config.js';
import { getOpenAIClient } from './openai.js';

export type ParsedDareKind = 'visual' | 'audio' | 'count' | 'timed';

export interface ParsedDareSuccess {
  ok: true;
  kind: ParsedDareKind;
  condition: {
    summary: string;
    successCriteria: string;
    countTarget?: number;
    durationSec: number;
  };
  cleanTitle: string;
}

export interface ParsedDareRejection {
  ok: false;
  reason: string;
}

export type ParsedDare = ParsedDareSuccess | ParsedDareRejection;

export const DARE_PARSE_JSON_SCHEMA = {
  name: 'prove_it_dare_parse',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      kind: { type: ['string', 'null'], enum: ['visual', 'audio', 'count', 'timed', null] },
      condition: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              successCriteria: { type: 'string' },
              countTarget: { type: ['integer', 'null'] },
              durationSec: { type: ['integer', 'null'], minimum: 30, maximum: 180 },
            },
            required: ['summary', 'successCriteria', 'countTarget', 'durationSec'],
          },
        ],
      },
      cleanTitle: { type: 'string' },
      reason: { type: ['string', 'null'] },
    },
    required: ['ok', 'kind', 'condition', 'cleanTitle', 'reason'],
  },
} as const;

export function validateParsedDare(value: unknown): value is ParsedDare {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Record<string, unknown>;
  if (parsed.ok === false) return typeof parsed.reason === 'string' && parsed.reason.trim().length > 0 && parsed.reason.length <= 180;
  if (parsed.ok !== true || !['visual', 'audio', 'count', 'timed'].includes(String(parsed.kind))) return false;
  if (typeof parsed.cleanTitle !== 'string' || !parsed.cleanTitle.trim() || parsed.cleanTitle.length > 100) return false;
  if (!parsed.condition || typeof parsed.condition !== 'object') return false;
  const condition = parsed.condition as Record<string, unknown>;
  if (typeof condition.summary !== 'string' || !condition.summary.trim()) return false;
  if (typeof condition.successCriteria !== 'string' || !condition.successCriteria.trim()) return false;
  if (!Number.isInteger(condition.durationSec) || Number(condition.durationSec) < 30 || Number(condition.durationSec) > 180) return false;
  if (condition.countTarget !== null && condition.countTarget !== undefined && (!Number.isInteger(condition.countTarget) || Number(condition.countTarget) < 1)) return false;
  if (parsed.kind === 'count' && (!Number.isInteger(condition.countTarget) || Number(condition.countTarget) < 1)) return false;
  return true;
}

const REJECTION_FALLBACK = 'I could not verify that dare. Try a clear challenge that can be seen or heard.';

export async function parseDare(text: string): Promise<ParsedDare> {
  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: config.OPENAI_VISION_MODEL,
      response_format: { type: 'json_schema', json_schema: DARE_PARSE_JSON_SCHEMA },
      messages: [
        {
          role: 'system',
          content: 'You parse Twitch viewer dares for a streamer. Reject unsafe dares, self-harm, drinking or substances, sexual content, hateful content, doxxing, dares requiring spending money, and dares impossible to verify from screen video or stream audio. Give a short viewer-facing reason. Accept only clear, safe, verifiable challenges. Return a concise cleanTitle and concrete successCriteria. Use kind visual, audio, count, or timed. Use durationSec 30 to 180, default 120. Set countTarget for count challenges; otherwise null. Do not invent extra requirements.',
        },
        { role: 'user', content: text },
      ],
    });
    const content = completion.choices[0]?.message.content;
    if (!content) return { ok: false, reason: REJECTION_FALLBACK };
    const raw: unknown = JSON.parse(content);
    let result = raw;
    if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).ok === true) {
      const condition = (raw as Record<string, unknown>).condition;
      if (condition && typeof condition === 'object') {
        const record = condition as Record<string, unknown>;
        result = { ...(raw as Record<string, unknown>), condition: { ...record, durationSec: record.durationSec ?? 120 } };
      }
    }
    if (!validateParsedDare(result)) return { ok: false, reason: REJECTION_FALLBACK };
    if (!result.ok) return { ok: false, reason: result.reason.slice(0, 180) };
    return {
      ...result,
      condition: {
        summary: result.condition.summary,
        successCriteria: result.condition.successCriteria,
        ...(typeof result.condition.countTarget === 'number' ? { countTarget: result.condition.countTarget } : {}),
        durationSec: result.condition.durationSec,
      },
    };
  } catch {
    return { ok: false, reason: 'Dare checking is unavailable right now. Please try again shortly.' };
  }
}
