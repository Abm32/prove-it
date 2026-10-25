import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingMs, stateToView, type OverlayState } from '../ui/overlay/view.ts';

test('remainingMs clamps at zero and uses server deadline', () => {
  assert.equal(remainingMs(5000, 2500), 2500);
  assert.equal(remainingMs(5000, 6000), 0);
  assert.equal(remainingMs(null, 0), 0);
});

test('stateToView maps idle, active, appeal and poll states', () => {
  const base: OverlayState = { current: null, status: 'IDLE', remainingMs: 0, latestTick: null, queue: [], passRate: 0.71, lastClipUrl: null };
  assert.equal(stateToView(base, 0).mode, 'idle');
  const current = { id: 1, title: 'Touch nose', viewerLogin: 'viewer', status: 'ACTIVE', bountyBits: 0, bountyPoints: 1000, deadlineAt: 10_000, appealCount: 0, appealThreshold: 3, appealRemainingMs: 0, pollRemainingMs: 0 };
  const active = stateToView({ ...base, current, latestTick: { progress: .5, confidence: .8, evidence: 'Visible' } }, 1000);
  assert.equal(active.mode, 'active');
  assert.equal(active.seconds, 9);
  assert.equal(active.evidence, 'Visible');
  assert.equal(stateToView({ ...base, current: { ...current, status: 'APPEAL' } }, 0).mode, 'appeal');
  assert.equal(stateToView({ ...base, current: { ...current, status: 'POLL' } }, 0).mode, 'poll');
});
