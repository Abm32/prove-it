import type { Tick } from './types.js';
import type { JudgeTickInput } from '../ai/vision.js';

export function createMockJudge(): (input: JudgeTickInput) => Promise<Tick> {
  let progress = 0;
  return async () => {
    progress = Math.min(1, Math.round((progress + 0.2) * 100) / 100);
    return { progress, evidence: `Demo progress ${Math.round(progress * 100)}%`, done: progress >= 1, confidence: 1, at: Date.now() };
  };
}

export function mockParseDare(text: string) {
  const cleanTitle = text.trim().slice(0, 80) || 'Demo dare';
  return Promise.resolve({ ok: true as const, kind: 'timed' as const,
    condition: { summary: cleanTitle, successCriteria: `Complete: ${cleanTitle}`, durationSec: 60 }, cleanTitle });
}
