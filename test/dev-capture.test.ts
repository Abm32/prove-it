import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import { registerDevRoutes } from '../src/web/dev.js';
import { registerApiRoutes } from '../src/web/api.js';
import { registerCaptureRoutes } from '../src/web/capture.js';
import type { RefereeService } from '../src/referee/service.js';

const service = { channelUserId: 'channel', activeDare: false, ingestFrame: async () => {}, ingestAudio: async () => '' } as unknown as RefereeService;

test('dev routes return 404 when disabled', async () => {
  const app = Fastify();
  await registerDevRoutes(app, service, false);
  const response = await app.inject({ method: 'POST', url: '/api/dev/dare', payload: { viewer: 'a', text: 'b' } });
  assert.equal(response.statusCode, 404);
  await app.close();
});

test('/api/state reports dev mode for the dashboard rehearsal control', async () => {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: 'test-secret' });
  await app.register(fastifyWebsocket);
  const state = { status: 'IDLE', captureActive: false, lastFrameAt: null };
  const stateService = { ...service, getPublicState: () => state } as unknown as RefereeService;
  await registerApiRoutes(app, stateService, 'test-secret', true);
  const response = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().devMode, true);
  assert.equal(response.json().captureActive, false);
  assert.equal(response.json().lastFrameAt, null);
  await app.close();
});

test('/api/state keeps dev mode false for a connected non-dev dashboard', async () => {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: 'test-secret' });
  await app.register(fastifyWebsocket);
  const stateService = { ...service, getPublicState: () => ({ status: 'IDLE', captureActive: false, lastFrameAt: null }) } as unknown as RefereeService;
  await registerApiRoutes(app, stateService, 'test-secret', false);
  const response = await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: `uid=${encodeURIComponent(app.signCookie('channel'))}` } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().devMode, false);
  await app.close();
});

test('capture rejects frames over 400 KB', async () => {
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024 });
  await app.register(fastifyCookie, { secret: 'test-secret' });
  await registerCaptureRoutes(app, service);
  const response = await app.inject({ method: 'POST', url: '/api/capture/frame', headers: { 'content-type': 'image/jpeg', cookie: `uid=${encodeURIComponent(app.signCookie('channel'))}` }, payload: Buffer.alloc(400 * 1024 + 1) });
  assert.equal(response.statusCode, 413);
  await app.close();
});

test('capture rejects audio over 2 MB', async () => {
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024 });
  await app.register(fastifyCookie, { secret: 'test-secret' });
  await registerCaptureRoutes(app, service);
  const response = await app.inject({ method: 'POST', url: '/api/capture/audio', headers: { 'content-type': 'audio/webm;codecs=opus', cookie: `uid=${encodeURIComponent(app.signCookie('channel'))}` }, payload: Buffer.alloc(2 * 1024 * 1024 + 1) });
  assert.equal(response.statusCode, 413);
  await app.close();
});

test('capture rejects WebM audio without an EBML header before transcription', async () => {
  let transcriptions = 0;
  const audioService = {
    ...service,
    activeDare: true,
    ingestAudio: async () => { transcriptions += 1; return 'unexpected'; },
  } as unknown as RefereeService;
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024 });
  await app.register(fastifyCookie, { secret: 'test-secret' });
  await registerCaptureRoutes(app, audioService);
  const response = await app.inject({
    method: 'POST',
    url: '/api/capture/audio',
    headers: { 'content-type': 'audio/webm;codecs=opus', cookie: `uid=${encodeURIComponent(app.signCookie('channel'))}` },
    payload: Buffer.from([0, 1, 2, 3]),
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: 'not_a_webm_file' });
  assert.equal(transcriptions, 0);
  await app.close();
});
