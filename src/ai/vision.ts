import type { Dare, Tick } from '../referee/types.js';
import { config } from '../config.js';
import { getOpenAIClient } from './openai.js';

export interface JudgeTickInput {
  dare: Dare;
  frames: Buffer[];
  transcript: string;
  elapsedSec: number;
  remainingSec: number;
  priorEvidence: string[];
}

export const VISION_TICK_JSON_SCHEMA = {
  name: 'prove_it_vision_tick',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      progress: { type: 'number', minimum: 0, maximum: 1 },
      evidence: { type: 'string' },
      done: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['progress', 'evidence', 'done', 'confidence'],
  },
} as const;

interface VisionResult { progress: number; evidence: string; done: boolean; confidence: number }

function validateVisionResult(value: unknown): value is VisionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return typeof result.progress === 'number' && result.progress >= 0 && result.progress <= 1
    && typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1
    && typeof result.done === 'boolean' && typeof result.evidence === 'string';
}

export async function judgeTick(input: JudgeTickInput): Promise<Tick> {
  const frameParts = input.frames.slice(-3).map((frame) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/jpeg;base64,${frame.toString('base64')}`, detail: 'low' as const },
  }));
  const context = [
    `Dare: ${input.dare.text}`,
    `Kind: ${input.dare.kind}`,
    `Success criteria: ${input.dare.condition.condition}`,
    `Count target: ${input.dare.condition.count_target ?? 'none'}`,
    `Elapsed seconds: ${input.elapsedSec}`,
    `Remaining seconds: ${input.remainingSec}`,
    `Recent transcript: ${input.transcript || '(none)'}`,
    `Prior evidence: ${input.priorEvidence.slice(-5).join(' | ') || '(none)'}`,
  ].join('\n');
  const completion = await getOpenAIClient().chat.completions.create({
    model: config.OPENAI_VISION_MODEL,
    response_format: { type: 'json_schema', json_schema: VISION_TICK_JSON_SCHEMA },
    messages: [
      {
        role: 'system',
        content: 'You are a conservative live-stream referee. Decide progress only from the supplied frames and transcript. Set done=true only when the dare success criteria are clearly visible or audible in this evidence. If evidence is missing, ambiguous, or only suggests completion, set done=false and report measured progress. Never infer events outside the provided evidence. Evidence must be a brief factual caption of at most 120 characters. Return progress and confidence from 0 to 1.',
      },
      { role: 'user', content: [{ type: 'text', text: context }, ...frameParts] },
    ],
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error('Vision model returned an empty result');
  const result: unknown = JSON.parse(content);
  if (!validateVisionResult(result)) throw new Error('Vision model returned an invalid tick');
  return {
    ...result,
    evidence: result.evidence.slice(0, 120),
    at: Date.now(),
  };
}
