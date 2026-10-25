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
import { registerCaptureRoutes } from './web/capture.js';
import { registerDevRoutes } from './web/dev.js';
import { registerAuthRoutes } from './web/auth.js';
import { verifyOverlayToken } from './web/overlayToken.js';
import { db } from './db.js';
import { createMockJudge, mockParseDare } from './referee/mock.js';

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
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
if (tokenRow || config.DEV_MODE) {
  try {
    const userId = tokenRow?.user_id ?? 'dev-channel';
    const rewardId = tokenRow ? tokenRow.reward_id ?? await ensureReward(userId) : 'dev-reward';
    eventsub = new EventSubClient({
      userId,
      broadcasterId: userId,
      getAccessToken: () => tokenRow ? getValidToken(userId) : Promise.resolve(''),
    });
    const demoHelix = {
      updateRedemptionStatus: async (...args: unknown[]) => { app.log.info({ call: 'updateRedemptionStatus', args }, 'Demo Helix no-op'); },
      sendChatMessage: async (_userId: string, _broadcasterId: string, _senderId: string, message: string) => { app.log.info({ message }, 'Demo Helix chat no-op'); return { data: [{ message_id: `demo-message-${Date.now()}` }] }; },
      pinChatMessage: async () => undefined,
      unpinChatMessage: async () => undefined,
      createClip: async () => ({ id: 'demo-clip' }),
      getClip: async () => null,
      createStreamMarker: async (...args: unknown[]) => { app.log.info({ call: 'createStreamMarker', args }, 'Demo Helix no-op'); return undefined; },
      getStream: async () => null,
      createPoll: async () => ({ id: `demo-poll-${Date.now()}` }),
    };
    referee = new RefereeService({
      userId,
      rewardId,
      eventsub,
      db,
      helix: tokenRow ? { updateRedemptionStatus, sendChatMessage, pinChatMessage, unpinChatMessage, createClip, getClip, createStreamMarker, getStream, createPoll } : demoHelix,
      ai: config.REFEREE_MOCK
        ? { parseDare: mockParseDare, judgeTick: createMockJudge(), transcribeChunk: async () => '' }
        : { parseDare, judgeTick, transcribeChunk },
    });
    referee.start();
    if (tokenRow) eventsub.start();
  } catch (error) {
    app.log.error({ error }, 'Could not start Twitch referee');
  }
}
await registerApiRoutes(app, referee, config.SESSION_SECRET, config.DEV_MODE);
await registerCaptureRoutes(app, referee);
await registerDevRoutes(app, referee, config.DEV_MODE);
app.addHook('onClose', async () => {
  referee?.stop();
  eventsub?.stop();
});

await app.listen({ host: '0.0.0.0', port: config.PORT });
