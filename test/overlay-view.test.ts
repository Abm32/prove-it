import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingMs, stateToView, type OverlayState } from '../ui/overlay/view.ts';

test('remainingMs clamps at zero and uses server deadline', () => {
  assert.equal(remainingMs(5000, 2500), 2500);
  assert.equal(remainingMs(5000, 6000), 0);
  assert.equal(remainingMs(null, 0), 0);
});

test('stateToView maps idle, active, appeal and poll states', () => {
  const base: OverlayState = { current: null, status: 'IDLE', remainingMs: 0, latestTick: null, queue: [], dareCount: 12, passRate: 0.71, lastClipUrl: null };
  assert.equal(stateToView(base, 0).mode, 'idle');
  const current = { id: 1, title: 'Touch nose', viewerLogin: 'viewer', status: 'ACTIVE', bountyBits: 0, bountyPoints: 1000, durationSec: 60, deadlineAt: 10_000, appealCount: 0, appealThreshold: 3, appealRemainingMs: 0, pollRemainingMs: 0 };
  const active = stateToView({ ...base, current, latestTick: { progress: .5, confidence: .8, evidence: 'Visible' } }, 1000);
  assert.equal(active.mode, 'active');
  assert.equal(active.seconds, 9);
  assert.equal(active.durationSec, 60);
  assert.equal(active.dareCount, 12);
  assert.equal(active.evidence, 'Visible');
  assert.equal(stateToView({ ...base, current: { ...current, status: 'APPEAL' } }, 0).mode, 'appeal');
  const poll = stateToView({ ...base, current: { ...current, status: 'POLL' }, poll: { kind: 'chat', overrule: 2, uphold: 1, endsAt: 60_000 }, lastMarker: true }, 0);
  assert.equal(poll.mode, 'poll');
  assert.deepEqual(poll.pollVotes, { overrule: 2, uphold: 1 });
  assert.equal(poll.markerSaved, true);
});

test('audio dare displays the latest transcript only when vision evidence is empty', () => {
  const base: OverlayState = {
    current: { id: 2, title: 'Say hello', viewerLogin: 'viewer', status: 'ACTIVE', kind: 'audio', bountyBits: 0, bountyPoints: 1000, durationSec: 60, deadlineAt: 10_000, appealCount: 0, appealThreshold: 3, appealRemainingMs: 0, pollRemainingMs: 0 },
    status: 'ACTIVE', remainingMs: 10_000, latestTick: null, queue: [], passRate: 0, dareCount: 1, lastClipUrl: null,
    lastTranscript: { text: 'hello chat', at: 1000 },
  };
  assert.equal(stateToView(base, 2000).evidence, '🎙 hello chat');
  assert.equal(stateToView({ ...base, latestTick: { progress: 0.5, confidence: 0.6, evidence: 'Mouth is moving' } }, 2000).evidence, 'Mouth is moving');
});
