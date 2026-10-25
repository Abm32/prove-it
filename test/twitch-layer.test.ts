import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createHelixClient, HelixError } from '../src/twitch/helix.js';
import { EventSubClient } from '../src/twitch/eventsub.js';
import { createOAuthState, verifyOAuthState } from '../src/twitch/oauth.js';
import { parseChatMessage } from '../src/twitch/parseChat.js';
import { createOverlayToken, verifyOverlayToken } from '../src/web/overlayToken.js';

const fixture = async (name: string): Promise<string> => readFile(join('test/fixtures', name), 'utf8');

test('EventSub welcome requests the subscription set and keepalive is accepted', async () => {
  const requested: unknown[] = [];
  const client = new EventSubClient({
    userId: 'bot-1',
    broadcasterId: 'broadcaster-1',
    getAccessToken: async () => 'access-token',
    subscribe: async (_token, sub) => { requested.push(sub); },
  });
  await client.handleMessage(await fixture('eventsub-welcome.json'));
  await client.handleMessage(await fixture('eventsub-keepalive.json'));
  assert.equal(requested.length, 6);
  assert.equal(client.sessionId, 'session-1');
});

test('EventSub logs an individual subscription failure and continues subscribing', async () => {
  const requested: string[] = [];
  const errors: unknown[][] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const client = new EventSubClient({
      userId: 'bot-1',
      broadcasterId: 'broadcaster-1',
      getAccessToken: async () => 'access-token',
      subscribe: async (_token, sub) => {
        requested.push(sub.type);
        if (sub.type === 'channel.cheer') throw new Error('mock subscription failure');
      },
    });
    await assert.doesNotReject(client.handleMessage(await fixture('eventsub-welcome.json')));
  } finally {
    console.error = previousError;
  }
  assert.equal(requested.length, 6);
  assert.ok(errors.some((args) => String(args[0]).includes('channel.cheer')));
});

test('EventSub emits each supported notification once by message id', async () => {
  const client = new EventSubClient({ userId: 'bot-1', broadcasterId: 'broadcaster-1', getAccessToken: async () => 'token' });
  const received: string[] = [];
  for (const event of ['redemption', 'chatMessage', 'cheer', 'pollEnd', 'streamOnline', 'streamOffline'] as const) {
    client.on(event, () => received.push(event));
  }
  for (const file of ['eventsub-redemption.json', 'eventsub-chat.json', 'eventsub-cheer.json', 'eventsub-poll-end.json', 'eventsub-stream-online.json', 'eventsub-stream-offline.json']) {
    const raw = await fixture(file);
    await client.handleMessage(raw);
    await client.handleMessage(raw);
  }
  assert.deepEqual(received, ['redemption', 'chatMessage', 'cheer', 'pollEnd', 'streamOnline', 'streamOffline']);
});

test('EventSub reconnect and revocation messages are surfaced', async () => {
  const client = new EventSubClient({ userId: 'bot-1', broadcasterId: 'broadcaster-1', getAccessToken: async () => 'token' });
  let reconnect = '';
  let revoked = false;
  client.on('reconnect', (url) => { reconnect = url; });
  client.on('revocation', () => { revoked = true; });
  await client.handleMessage(await fixture('eventsub-reconnect.json'));
  await client.handleMessage(await fixture('eventsub-revocation.json'));
  assert.equal(reconnect, 'ws://127.0.0.1:8080/ws/reconnect');
  assert.equal(revoked, true);
});

test('chat parser recognizes Bits dares and plain appeals', () => {
  const base = { message: { text: '!dare no-scope in two minutes' } };
  assert.deepEqual(parseChatMessage({ ...base, cheer: { bits: 100 } }), { kind: 'dare', text: 'no-scope in two minutes', bits: 100 });
  assert.deepEqual(parseChatMessage({ message: { text: ' !APPEAL ' } }), { kind: 'appeal' });
  assert.equal(parseChatMessage({ ...base, cheer: { bits: 0 } }), null);
  assert.equal(parseChatMessage({ message: { text: '!dare   ' }, cheer: { bits: 500 } }), null);
});

test('Helix refreshes after a 401 and retries exactly once', async () => {
  let calls = 0;
  let refreshes = 0;
  const client = createHelixClient({
    clientId: 'client',
    getToken: async () => 'old-token',
    refreshToken: async () => { refreshes += 1; return 'new-token'; },
    fetch: async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer old-token');
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      }
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer new-token');
      return new Response(JSON.stringify({ data: [{ id: 'user-1' }] }), { status: 200 });
    },
  });
  const result = await client.helix<{ data: Array<{ id: string }> }>('user-1', 'GET', '/users');
  assert.equal(result.data[0]?.id, 'user-1');
  assert.equal(calls, 2);
  assert.equal(refreshes, 1);
});

test('Helix waits until Ratelimit-Reset and reports the 429 error', async () => {
  let waited = 0;
  let calls = 0;
  const reset = Math.ceil(Date.now() / 1000);
  const client = createHelixClient({
    clientId: 'client',
    getToken: async () => 'token',
    refreshToken: async () => 'token',
    sleep: async (ms) => { waited = ms; },
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: 'Too Many Requests' }), {
      status: 429,
      headers: { 'Ratelimit-Reset': String(reset) },
      });
    },
  });
  await assert.rejects(client.helix('user-1', 'GET', '/users'), (error: unknown) => error instanceof HelixError && error.status === 429);
  assert.ok(waited >= 0 && waited <= 1000);
  assert.equal(calls, 2);
});

test('overlay tokens verify for their uid and reject tampering', () => {
  const token = createOverlayToken('streamer-1', 'test-secret');
  assert.equal(verifyOverlayToken(token, 'test-secret'), 'streamer-1');
  assert.equal(verifyOverlayToken(`${token}x`, 'test-secret'), null);
});

test('OAuth state is a signed nonce and rejects modification', () => {
  const state = createOAuthState('test-secret');
  assert.equal(verifyOAuthState(state, 'test-secret'), true);
  assert.equal(verifyOAuthState(`${state}x`, 'test-secret'), false);
  assert.equal(verifyOAuthState(state, 'wrong-secret'), false);
});
