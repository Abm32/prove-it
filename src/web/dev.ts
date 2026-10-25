import type { FastifyInstance } from 'fastify';
import type { RefereeService } from '../referee/service.js';

interface DareBody { viewer?: string; text?: string; bits?: number }
interface TickBody { progress?: number; confidence?: number; done?: boolean; evidence?: string; deadline?: boolean }
interface AppealBody { viewer?: string }
interface PollBody { overrule?: boolean }
type ServiceSource = RefereeService | null | (() => RefereeService | null);
function getService(source: ServiceSource): RefereeService | null { return typeof source === 'function' ? source() : source; }

export async function registerDevRoutes(app: FastifyInstance, source: ServiceSource, enabled: boolean): Promise<void> {
  app.post<{ Body: DareBody }>('/api/dev/dare', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ error: 'Not found' });
    const service = getService(source);
    if (!service) return reply.code(503).send({ error: 'Referee is not connected' });
    const { viewer, text, bits = 0 } = request.body ?? {};
    if (!viewer || !text || !Number.isInteger(bits) || bits < 0) return reply.code(400).send({ error: 'viewer, text and non-negative integer bits required' });
    await service.injectDare(viewer, text, bits);
    return { ok: true, state: service.getPublicState() };
  });
  app.post<{ Body: TickBody }>('/api/dev/tick', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ error: 'Not found' });
    const service = getService(source);
    if (!service) return reply.code(503).send({ error: 'Referee is not connected' });
    const { progress, confidence, done, evidence, deadline } = request.body ?? {};
    if (typeof progress !== 'number' || typeof confidence !== 'number' || typeof done !== 'boolean' || typeof evidence !== 'string') return reply.code(400).send({ error: 'progress, confidence, done and evidence required' });
    const state = service.getPublicState();
    const at = deadline && state.current?.deadlineAt ? state.current.deadlineAt : Date.now();
    await service.applyTick({ progress, confidence, done, evidence, at });
    return { ok: true, state: service.getPublicState() };
  });
  app.post<{ Body: AppealBody }>('/api/dev/appeal', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ error: 'Not found' });
    const service = getService(source);
    if (!service) return reply.code(503).send({ error: 'Referee is not connected' });
    await service.injectAppeal(request.body?.viewer ?? 'demo_viewer');
    return { ok: true, state: service.getPublicState() };
  });
  app.post<{ Body: PollBody }>('/api/dev/poll', async (request, reply) => {
    if (!enabled) return reply.code(404).send({ error: 'Not found' });
    const service = getService(source);
    if (!service) return reply.code(503).send({ error: 'Referee is not connected' });
    if (typeof request.body?.overrule !== 'boolean') return reply.code(400).send({ error: 'overrule must be a boolean' });
    await service.injectPoll(request.body.overrule);
    return { ok: true, state: service.getPublicState() };
  });
}
