import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import test from 'node:test';
import { registerAuthRoutes } from '../src/web/auth.js';

test('/api/me returns the stable not_connected error when uid is absent', async () => {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: 'test-secret' });
  await registerAuthRoutes(app);
  const response = await app.inject({ method: 'GET', url: '/api/me' });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: 'not_connected' });
  await app.close();
});

test('OAuth callback validation errors render HTML with a retry link', async () => {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: 'test-secret' });
  await registerAuthRoutes(app);
  const response = await app.inject({ method: 'GET', url: '/auth/twitch/callback?code=bad&state=invalid' });
  assert.equal(response.statusCode, 400);
  assert.match(response.headers['content-type'] ?? '', /text\/html/);
  assert.match(response.body, /Try again/);
  assert.match(response.body, /\/auth\/twitch/);
  await app.close();
});
