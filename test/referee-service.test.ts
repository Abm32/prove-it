import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { validateParsedDare } from '../src/ai/dareParser.js';
import type { EventSubClient, PollEndEvent, RedemptionEvent } from '../src/twitch/eventsub.js';
import { EventSubClient as EventSub } from '../src/twitch/eventsub.js';
import type { ParsedDare } from '../src/ai/dareParser.js';
import { migrate } from '../src/db.js';
import { isCaptureActive, RefereeService, type RefereeClock, type RefereeHelix } from '../src/referee/service.js';
import type { Tick } from '../src/referee/types.js';
import { capabilitiesFor, type ChannelCapabilities } from '../src/twitch/capabilities.js';

class FakeClock implements RefereeClock {
  value = 1_000_000;
  now(): number { return this.value; }
  setInterval(_callback: () => void, _milliseconds: number): ReturnType<typeof setInterval> { return undefined as ReturnType<typeof setInterval>; }
  clearInterval(_timer: ReturnType<typeof setInterval>): void {}
  advance(milliseconds: number): void { this.value += milliseconds; }
}

function setup(parsedResults?: Record<string, ParsedDare>, ticks: Tick[] = [], capabilities: ChannelCapabilities = capabilitiesFor('partner')) {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const clock = new FakeClock();
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const record = (name: string) => async (...args: unknown[]) => { calls.push({ name, args }); };
  const helix: RefereeHelix = {
    updateRedemptionStatus: record('redemption-status'),
    sendChatMessage: async (...args) => { calls.push({ name: 'chat', args }); return { data: [{ message_id: `message-${calls.length}` }] }; },
    pinChatMessage: async (...args) => { calls.push({ name: 'pin', args }); },
    unpinChatMessage: record('unpin'),
    createClip: async (...args) => { calls.push({ name: 'create-clip', args }); return { id: 'clip-1' }; },
    getClip: async (...args) => { calls.push({ name: 'get-clip', args }); return { id: 'clip-1', url: 'https://clips.twitch.tv/clip-1' }; },
    createStreamMarker: record('marker'),
    getStream: async (...args) => { calls.push({ name: 'get-stream', args }); return { id: 'stream-1' }; },
    createPoll: async (...args) => { calls.push({ name: 'create-poll', args }); return { id: 'poll-1' }; },
  };
  const eventsub = new EventSub({
    userId: 'streamer-1',
    broadcasterId: 'streamer-1',
    getAccessToken: async () => 'test-token',
    subscribe: async () => undefined,
  });
  const service = new RefereeService({
    userId: 'streamer-1',
    rewardId: 'reward-1',
    capabilities,
    eventsub: eventsub as EventSubClient,
    db,
    helix,
    ai: {
      parseDare: async (text) => parsedResults?.[text] ?? {
        ok: true,
        kind: 'visual',
        cleanTitle: `Do ${text}`,
        condition: { summary: text, successCriteria: text, durationSec: 30 },
      },
      judgeTick: async () => ticks.shift() ?? { at: clock.now(), progress: 0, evidence: 'No evidence', done: false, confidence: 0.2 },
      transcribeChunk: async () => 'transcribed phrase',
    },
    clock,
    tickMs: 2000,
  });
  return { db, clock, calls, service };
}

function chatMessage(text: string, viewerId: string, bits?: number) {
  return {
    message_id: `message-${viewerId}-${text}`,
    broadcaster_user_id: 'streamer-1',
    chatter_user_id: viewerId,
    chatter_user_login: viewerId,
    chatter_user_name: viewerId,
    message: { text, fragments: [] },
    message_type: 'text',
    badges: [],
    ...(bits === undefined ? {} : { cheer: { bits } }),
  };
}

function redemption(text: string, viewerId = 'viewer-1'): RedemptionEvent {
  return {
    id: `redemption-${viewerId}`,
    broadcaster_user_id: 'streamer-1',
    user_id: viewerId,
    user_login: viewerId,
    user_name: viewerId,
    user_input: text,
    status: 'unfulfilled',
    reward: { id: 'reward-1', title: 'Dare the streamer', cost: 1000, prompt: 'Dare' },
    redeemed_at: new Date(1_000_000).toISOString(),
  };
}

const passTick = (at: number): Tick => ({ at, progress: 1, evidence: 'The requested action is visible', done: true, confidence: 0.95 });

test('capture is active only while a frame arrived in the last five seconds', () => {
  assert.equal(isCaptureActive(null, 10_000), false);
  assert.equal(isCaptureActive(5_000, 10_000), true);
  assert.equal(isCaptureActive(4_999, 10_000), false);
  assert.equal(isCaptureActive(10_001, 10_000), false);
});

test('ingesting a frame updates the public capture timestamp and status', async () => {
  const { service, clock } = setup();
  await service.ingestFrame(Buffer.from([1, 2, 3]));
  assert.equal(service.getPublicState().lastFrameAt, clock.now());
  assert.equal(service.getPublicState().captureActive, true);
  clock.advance(5001);
  assert.equal(service.getPublicState().captureActive, false);
});

test('redemption queues, starts, and passes after two qualifying ticks with ordered side effects', async () => {
  const { service, clock, calls, db } = setup(undefined, [passTick(1), passTick(2)]);
  await service.onRedemption(redemption('wave once'));
  assert.equal(service.getPublicState().current?.status, 'ACTIVE');
  clock.advance(2000);
  await service.runTick();
  assert.equal(service.getPublicState().current?.status, 'JUDGING');
  clock.advance(2000);
  await service.runTick();
  assert.equal(service.getPublicState().current?.status, 'PASS');
  const names = calls.map((call) => call.name);
  const passActions = ['redemption-status', 'get-stream', 'create-clip', 'get-clip', 'marker', 'chat', 'unpin'];
  const positions = passActions.map((name) => names.lastIndexOf(name));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const row = db.prepare('SELECT status, verdict, clip_url FROM dares').get() as { status: string; verdict: string; clip_url: string };
  assert.equal(row.status, 'PASS');
  assert.equal(row.verdict, 'PASS');
  assert.equal(row.clip_url, 'https://clips.twitch.tv/clip-1');
});

test('public state exposes active duration, total dare count, and pass rate', async () => {
  const { service, clock } = setup(undefined, [passTick(1), passTick(2)]);
  await service.onRedemption(redemption('first dare'));
  assert.equal(service.getPublicState().current?.durationSec, 30);
  assert.equal(service.getPublicState().dareCount, 1);
  assert.equal(service.getPublicState().passRate, 0);
  clock.advance(1000);
  await service.runTick();
  clock.advance(1000);
  await service.runTick();
  clock.advance(30_001);
  await service.advance();
  assert.equal(service.getPublicState().passRate, 1);
  assert.equal(service.getPublicState().dareCount, 1);
});

test('rejected redemption is refunded and is not inserted', async () => {
  const { service, calls, db } = setup({
    'dangerous dare': { ok: false, reason: 'That challenge is unsafe.' },
  });
  await service.onRedemption(redemption('dangerous dare'));
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM dares').get() as { count: number }).count, 0);
  assert.ok(calls.some((call) => call.name === 'redemption-status' && call.args.at(-1) === 'CANCELED'));
  assert.ok(calls.some((call) => call.name === 'chat' && String(call.args.at(-1)).includes('That challenge is unsafe.')));
});

test('deadline FAIL with three appeals opens a poll; overrule settles FINAL_PASS with a clip', async () => {
  const { service, clock, calls, db } = setup();
  await service.onRedemption(redemption('beat the timer'));
  clock.advance(30_000);
  await service.advance();
  assert.equal(service.getPublicState().current?.status, 'FAIL');
  assert.ok(calls.some((call) => call.name === 'redemption-status' && call.args.at(-1) === 'FULFILLED'));
  for (const viewerId of ['appeal-1', 'appeal-2', 'appeal-3']) {
    await service.onChatMessage({
      message_id: `message-${viewerId}`,
      broadcaster_user_id: 'streamer-1',
      chatter_user_id: viewerId,
      chatter_user_login: viewerId,
      chatter_user_name: viewerId,
      message: { text: '!appeal', fragments: [] },
      message_type: 'text',
      badges: [],
    });
  }
  assert.equal(service.getPublicState().current?.status, 'POLL');
  assert.ok(calls.some((call) => call.name === 'create-poll'));
  const poll: PollEndEvent = {
    id: 'poll-1',
    broadcaster_user_id: 'streamer-1',
    title: 'Overrule the ref?',
    choices: [
      { id: 'yes', title: "Overrule — it's a PASS", votes: 5, channel_points_votes: 0 },
      { id: 'no', title: 'Uphold — FAIL stands', votes: 2, channel_points_votes: 0 },
    ],
    status: 'completed',
    started_at: new Date(clock.now()).toISOString(),
    ended_at: new Date(clock.now()).toISOString(),
  };
  await service.onPollEnd(poll);
  const row = db.prepare('SELECT status, verdict, clip_url FROM dares').get() as { status: string; verdict: string; clip_url: string };
  assert.equal(row.status, 'FINAL_PASS');
  assert.equal(row.verdict, 'PASS');
  assert.equal(row.clip_url, 'https://clips.twitch.tv/clip-1');
  assert.ok(calls.some((call) => call.name === 'chat' && String(call.args.at(-1)).includes('Chat overruled the ref')));
});

test('Bits dares outrank queued Channel Point dares', async () => {
  const { service } = setup();
  service.setPaused(true);
  await service.onRedemption(redemption('points challenge', 'points-viewer'));
  await service.onChatMessage({
    message_id: 'bits-message',
    broadcaster_user_id: 'streamer-1',
    chatter_user_id: 'bits-viewer',
    chatter_user_login: 'bits-viewer',
    chatter_user_name: 'bits-viewer',
    message: { text: '!dare say hello', fragments: [] },
    message_type: 'text',
    badges: [],
    cheer: { bits: 25 },
  });
  service.setPaused(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(service.getPublicState().current?.viewerLogin, 'bits-viewer');
  assert.equal(service.getPublicState().current?.bountyBits, 25);
});

test('chat-mode dare without a cheer enters the queue for free', async () => {
  const { service, db } = setup(undefined, [], capabilitiesFor(''));
  await service.onChatMessage(chatMessage('!dare say hello', 'free-viewer'));
  const state = service.getPublicState();
  assert.equal(state.current?.status, 'ACTIVE');
  assert.equal(state.current?.bountyBits, 0);
  assert.equal(state.current?.bountyPoints, 0);
  const row = db.prepare('SELECT bounty_points, bounty_bits FROM dares').get() as { bounty_points: number; bounty_bits: number };
  assert.equal(row.bounty_points, 0);
  assert.equal(row.bounty_bits, 0);
});

test('chat mode limits each viewer to one queued dare and explains the limit in chat', async () => {
  const { service, calls } = setup(undefined, [], capabilitiesFor(''));
  service.setPaused(true);
  await service.onChatMessage(chatMessage('!dare first', 'repeat-viewer'));
  await service.onChatMessage(chatMessage('!dare second', 'repeat-viewer'));
  assert.equal(service.getPublicState().queue.length, 1);
  assert.ok(calls.some((call) => String(call.args.at(-1)) === 'You already have a dare queued'));
});

test('chat jury uses distinct last votes and resolves an overrule after 60 seconds', async () => {
  const { service, clock, calls } = setup(undefined, [], capabilitiesFor(''));
  await service.onChatMessage(chatMessage('!dare say hello', 'dare-setter'));
  clock.advance(30_000);
  await service.advance();
  for (const viewer of ['appeal-1', 'appeal-2', 'appeal-3']) await service.onChatMessage(chatMessage('!appeal', viewer));
  assert.equal(service.getPublicState().current?.status, 'POLL');
  assert.deepEqual(service.getPublicState().poll, { kind: 'chat', overrule: 0, uphold: 0, endsAt: clock.now() + 60_000 });
  await service.onChatMessage(chatMessage('!uphold', 'voter-a'));
  await service.onChatMessage(chatMessage('!uphold', 'voter-b'));
  await service.onChatMessage(chatMessage('!overrule', 'voter-a'));
  await service.onChatMessage(chatMessage('!overrule', 'voter-c'));
  assert.deepEqual(service.getPublicState().poll && { overrule: service.getPublicState().poll!.overrule, uphold: service.getPublicState().poll!.uphold }, { overrule: 2, uphold: 1 });
  clock.advance(60_000);
  await service.advance();
  assert.equal(service.getPublicState().current?.status, 'FINAL_PASS');
  assert.equal(calls.some((call) => call.name === 'create-poll'), false);
});

test('chat-mode pass saves a marker without creating a clip', async () => {
  const { service, calls } = setup(undefined, [passTick(1), passTick(2)], capabilitiesFor(''));
  await service.onChatMessage(chatMessage('!dare wave', 'free-viewer'));
  await service.runTick();
  await service.runTick();
  assert.equal(service.getPublicState().lastMarker, true);
  assert.equal(calls.some((call) => call.name === 'create-clip'), false);
  assert.ok(calls.some((call) => call.name === 'marker'));
  assert.ok(calls.some((call) => String(call.args.at(-1)).includes('marker saved')));
});

test('validateParsedDare rejects duration outside the accepted range', () => {
  assert.equal(validateParsedDare({
    ok: true,
    kind: 'timed',
    cleanTitle: 'Hold still',
    condition: { summary: 'hold still', successCriteria: 'remain still', durationSec: 181 },
  }), false);
});
