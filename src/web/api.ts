import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyOverlayToken } from './overlayToken.js';
import type { RefereeService } from '../referee/service.js';

interface TokenQuery { token?: string }
interface DaresQuery { limit?: string }
interface PauseBody { paused?: boolean }

function cookieUid(request: FastifyRequest): string | null {
  const value = request.unsignCookie(request.cookies.uid ?? '');
  return value.valid && value.value ? value.value : null;
}

function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: 'Unauthorized' });
}

function serviceUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ error: 'Referee is not connected' });
}

type ServiceSource = RefereeService | null | (() => RefereeService | null);
function getService(source: ServiceSource): RefereeService | null { return typeof source === 'function' ? source() : source; }

export async function registerApiRoutes(app: FastifyInstance, source: ServiceSource, sessionSecret: string, devMode = false): Promise<void> {
  app.get<{ Querystring: TokenQuery }>('/api/state', async (request, reply) => {
    const service = getService(source);
    if (!service) return serviceUnavailable(reply);
    const tokenUid = request.query.token ? verifyOverlayToken(request.query.token, sessionSecret) : null;
    const uid = tokenUid ?? cookieUid(request) ?? (devMode ? service.channelUserId : null);
    if (!uid || uid !== service.channelUserId) return unauthorized(reply);
    return service.getPublicState();
  });

  app.post('/api/dare/veto', async (request, reply) => {
    const service = getService(source);
    if (!service) return serviceUnavailable(reply);
    if (cookieUid(request) !== service.channelUserId) return unauthorized(reply);
    await service.veto();
    return { ok: true };
  });

  app.post('/api/dare/skip', async (request, reply) => {
    const service = getService(source);
    if (!service) return serviceUnavailable(reply);
    if (cookieUid(request) !== service.channelUserId) return unauthorized(reply);
    await service.skip();
    return { ok: true };
  });

  app.post<{ Body: PauseBody }>('/api/pause', async (request, reply) => {
    const service = getService(source);
    if (!service) return serviceUnavailable(reply);
    if (cookieUid(request) !== service.channelUserId) return unauthorized(reply);
    if (typeof request.body?.paused !== 'boolean') return reply.code(400).send({ error: 'paused must be a boolean' });
    service.setPaused(request.body.paused);
    return { ok: true, paused: request.body.paused };
  });

  app.get<{ Querystring: DaresQuery }>('/api/dares', async (request, reply) => {
    const service = getService(source);
    if (!service) return serviceUnavailable(reply);
    if (cookieUid(request) !== service.channelUserId) return unauthorized(reply);
    const parsed = request.query.limit === undefined ? 50 : Number(request.query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return reply.code(400).send({ error: 'limit must be an integer from 1 to 100' });
    return { dares: service.getDares(parsed) };
  });

  app.get<{ Querystring: TokenQuery }>('/ws/overlay', { websocket: true }, (socket, request) => {
    const service = getService(source);
    const wsUid = request.query.token ? verifyOverlayToken(request.query.token, sessionSecret) : cookieUid(request);
    if (!service || (wsUid !== service.channelUserId && !(devMode && !wsUid))) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    const sendState = (): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(service.getPublicState()));
    };
    const unsubscribe = service.subscribe(sendState);
    const interval = setInterval(sendState, 1000);
    socket.on('close', () => {
      clearInterval(interval);
      unsubscribe();
    });
  });
}
