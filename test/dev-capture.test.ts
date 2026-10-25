import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { registerDevRoutes } from '../src/web/dev.js';
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
