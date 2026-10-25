import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { resolve } from 'node:path';
import { config } from './config.js';
import { getClip, createClip, createPoll, createStreamMarker, getStream, pinChatMessage, sendChatMessage, unpinChatMessage, updateRedemptionStatus } from './twitch/helix.js';
import { EventSubClient } from './twitch/eventsub.js';
import { getValidToken } from './twitch/tokenStore.js';
import { ensureReward } from './twitch/setup.js';
import { parseDare } from './ai/dareParser.js';
import { judgeTick } from './ai/vision.js';
import { transcribeChunk } from './ai/stt.js';
import { RefereeService } from './referee/service.js';
import { registerApiRoutes } from './web/api.js';
import { registerAuthRoutes } from './web/auth.js';
import { verifyOverlayToken } from './web/overlayToken.js';
import { db } from './db.js';

const app = Fastify({ logger: true });
await app.register(fastifyCookie, { secret: config.SESSION_SECRET });
await app.register(fastifyWebsocket);
await app.register(fastifyStatic, { root: resolve('public'), prefix: '/' });
app.get('/healthz', async () => ({ status: 'ok' }));
await registerAuthRoutes(app);
app.get<{ Querystring: { token?: string } }>('/overlay', async (request, reply) => {
  const token = request.query.token;
  if (!token || !verifyOverlayToken(token, config.SESSION_SECRET)) return reply.code(401).send({ error: 'Invalid overlay token' });
  return reply.sendFile('overlay/index.html');
});

const tokenRow = db.prepare('SELECT user_id, reward_id FROM tokens ORDER BY rowid LIMIT 1').get() as { user_id: string; reward_id: string | null } | undefined;
let referee: RefereeService | null = null;
let eventsub: EventSubClient | null = null;
if (tokenRow) {
  try {
    const rewardId = tokenRow.reward_id ?? await ensureReward(tokenRow.user_id);
    eventsub = new EventSubClient({
      userId: tokenRow.user_id,
      broadcasterId: tokenRow.user_id,
      getAccessToken: () => getValidToken(tokenRow.user_id),
    });
    referee = new RefereeService({
      userId: tokenRow.user_id,
      rewardId,
      eventsub,
      db,
      helix: { updateRedemptionStatus, sendChatMessage, pinChatMessage, unpinChatMessage, createClip, getClip, createStreamMarker, getStream, createPoll },
      ai: { parseDare, judgeTick, transcribeChunk },
    });
    referee.start();
    eventsub.start();
  } catch (error) {
    app.log.error({ error }, 'Could not start Twitch referee');
  }
}
await registerApiRoutes(app, referee, config.SESSION_SECRET);
app.addHook('onClose', async () => {
  referee?.stop();
  eventsub?.stop();
});

await app.listen({ host: '0.0.0.0', port: config.PORT });
