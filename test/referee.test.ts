import assert from 'node:assert/strict';
import test from 'node:test';
import { appeal, advance, createDareMachine, resolvePoll, start, tick, veto } from '../src/referee/machine.js';
import { Dare, Tick as RefereeTick } from '../src/referee/types.js';
import { DareQueue } from '../src/referee/queue.js';

const dare: Dare = {
  id: 1,
  channelId: 'channel-1',
  viewerId: 'viewer-1',
  viewerLogin: 'viewer',
  viewerName: 'Viewer',
  text: 'Land a no-scope',
  kind: 'visual',
  condition: { type: 'visual', condition: 'Land a no-scope', count_target: null },
  bountyPoints: 1000,
  bountyBits: 0,
  createdAt: 100,
  durationSec: 20,
};

const sampleTick = (at: number, done = true, confidence = 0.9): RefereeTick => ({
  at,
  progress: done ? 1 : 0.5,
  evidence: 'Evidence observed',
  done,
  confidence,
});

test('start activates a queued dare and sets its deadline', () => {
  const active = start(createDareMachine(dare), 1000);
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.startedAt, 1000);
  assert.equal(active.deadlineAt, 21000);
});

test('veto is allowed from QUEUED and ACTIVE only', () => {
  assert.equal(veto(createDareMachine(dare)).status, 'VETOED');
  assert.equal(veto(start(createDareMachine(dare), 1000)).status, 'VETOED');
  assert.throws(() => veto(advance(start(createDareMachine(dare), 1000), 21000)), /illegal/i);
});

test('one qualifying tick does not pass; two consecutive qualifying ticks do', () => {
  const active = start(createDareMachine(dare), 1000);
  const judging = tick(active, sampleTick(2000));
  assert.equal(judging.status, 'JUDGING');
  assert.equal(judging.history.length, 1);
  assert.equal(tick(judging, sampleTick(3000)).status, 'PASS');
});

test('a non-qualifying tick breaks the consecutive success streak', () => {
  const active = start(createDareMachine(dare), 1000);
  const one = tick(active, sampleTick(2000));
  const broken = tick(one, sampleTick(3000, true, 0.4));
  assert.equal(broken.status, 'ACTIVE');
  assert.equal(tick(broken, sampleTick(4000)).status, 'JUDGING');
});

test('deadline produces FAIL and later ticks are illegal', () => {
  const active = start(createDareMachine(dare), 1000);
  const failed = advance(active, 21000);
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.decidedAt, 21000);
  assert.throws(() => tick(failed, sampleTick(22000)), /illegal/i);
});

test('appeals reach POLL at the threshold and majority overrule flips FAIL', () => {
  let state = advance(start(createDareMachine(dare), 1000), 21000);
  state = appeal(state, 'viewer-1', 21001);
  assert.equal(state.status, 'APPEAL');
  state = appeal(state, 'viewer-2', 21002);
  state = appeal(state, 'viewer-3', 21003);
  assert.equal(state.status, 'POLL');
  assert.equal(resolvePoll(state, true, 21010).status, 'FINAL_PASS');
  assert.equal(resolvePoll(state, false, 21010).status, 'FINAL_FAIL');
});

test('appeals are unique per viewer and accepted only within the window', () => {
  const failed = advance(start(createDareMachine(dare), 1000), 21000);
  const duplicate = appeal(appeal(failed, 'same-viewer', 21001), 'same-viewer', 21002);
  assert.equal(duplicate.appeals.length, 1);
  assert.throws(() => appeal(failed, 'late-viewer', 51001), /illegal/i);
});

test('PASS becomes FINAL_PASS when its appeal window expires', () => {
  const passed = tick(tick(start(createDareMachine(dare), 1000), sampleTick(2000)), sampleTick(3000));
  assert.equal(advance(passed, 32999).status, 'PASS');
  assert.equal(advance(passed, 33000).status, 'FINAL_PASS');
});

test('priority queue orders by bits then creation time and permits one active dare', () => {
  const queue = new DareQueue();
  queue.push({ ...dare, id: 1, bountyBits: 5, createdAt: 100 });
  queue.push({ ...dare, id: 2, bountyBits: 10, createdAt: 200 });
  queue.push({ ...dare, id: 3, bountyBits: 10, createdAt: 50 });
  assert.equal(queue.next()?.id, 3);
  assert.equal(queue.next(), undefined);
  queue.finish();
  assert.equal(queue.next()?.id, 2);
  queue.finish();
  assert.equal(queue.next()?.id, 1);
});
