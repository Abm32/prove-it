import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RefereeService } from '../referee/service.js';

const FRAME_LIMIT = 400 * 1024;
const AUDIO_LIMIT = 2 * 1024 * 1024;
type ServiceSource = RefereeService | null | (() => RefereeService | null);
function getService(source: ServiceSource): RefereeService | null { return typeof source === 'function' ? source() : source; }

function uid(request: FastifyRequest): string | null {
  const signed = request.unsignCookie(request.cookies.uid ?? '');
  return signed.valid ? signed.value : null;
}

export async function registerCaptureRoutes(app: FastifyInstance, source: ServiceSource): Promise<void> {
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: FRAME_LIMIT }, (_request, body, done) => done(null, body));
  app.addContentTypeParser(/^audio\/webm(?:;.*)?$/, { parseAs: 'buffer', bodyLimit: AUDIO_LIMIT }, (_request, body, done) => done(null, body));
  app.post('/api/capture/frame', async (request, reply) => {
    const service = getService(source);
    if (!service) return reply.code(503).send({ error: 'Referee is not connected' });
    if (uid(request) !== service.channelUserId) return reply.code(401).send({ error: 'Unauthorized' });
    const body = request.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length > FRAME_LIMIT) return reply.code(413).send({ error: 'Frame exceeds 400 KB' });
    await service.ingestFrame(body);
    return { ok: true };
  });
  app.post('/api/capture/audio', async (request, reply) => {
    const service = getService(source);
    if (!service) return reply.code(503).send({ error: 'Referee is not connected' });
    if (uid(request) !== service.channelUserId) return reply.code(401).send({ error: 'Unauthorized' });
    const body = request.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length > AUDIO_LIMIT) return reply.code(413).send({ error: 'Audio exceeds 2 MB' });
    if (!service.activeDare) return { ok: true, skipped: true };
    const transcript = await service.ingestAudio(body, request.headers['content-type'] ?? 'audio/webm');
    return { ok: true, transcript };
  });
}
