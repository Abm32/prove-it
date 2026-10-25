import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { config } from './config.js';
import { registerAuthRoutes } from './web/auth.js';
import { verifyOverlayToken } from './web/overlayToken.js';
import './db.js';

const app = Fastify({ logger: true });
await app.register(fastifyCookie, { secret: config.SESSION_SECRET });
await app.register(fastifyStatic, { root: resolve('public'), prefix: '/' });
app.get('/healthz', async () => ({ status: 'ok' }));
await registerAuthRoutes(app);
app.get<{ Querystring: { token?: string } }>('/overlay', async (request, reply) => {
  const token = request.query.token;
  if (!token || !verifyOverlayToken(token, config.SESSION_SECRET)) return reply.code(401).send({ error: 'Invalid overlay token' });
  return reply.sendFile('overlay/index.html');
});

await app.listen({ host: '0.0.0.0', port: config.PORT });
