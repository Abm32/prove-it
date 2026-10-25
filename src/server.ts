import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { config } from './config.js';
import './db.js';

const app = Fastify({ logger: true });
await app.register(fastifyStatic, { root: resolve('public'), prefix: '/' });
app.get('/healthz', async () => ({ status: 'ok' }));

await app.listen({ host: '0.0.0.0', port: config.PORT });
