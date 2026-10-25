import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockJudge } from '../src/referee/mock.js';

test('mock judge increases progress by 0.2 and completes deterministically', async () => {
  const judge = createMockJudge();
  const input = { dare: {} as never, frames: [], transcript: '', elapsedSec: 0, remainingSec: 60, priorEvidence: [] };
  const ticks = [];
  for (let i = 0; i < 5; i += 1) ticks.push(await judge(input));
  assert.deepEqual(ticks.map((tick) => tick.progress), [.2, .4, .6, .8, 1]);
  assert.deepEqual(ticks.map((tick) => tick.done), [false, false, false, false, true]);
  assert.ok(ticks.every((tick) => tick.confidence === 1));
});
