import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getUsers } from '../twitch/helix.js';
import { buildAuthorizeUrl, exchangeCode, validateAccessToken, verifyOAuthState } from '../twitch/oauth.js';
import { ensureReward } from '../twitch/setup.js';
import { saveToken } from '../twitch/tokenStore.js';
import { createOverlayToken } from './overlayToken.js';

interface AuthQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/twitch', async (_request, reply) => reply.redirect(buildAuthorizeUrl()));

  app.get<{ Querystring: AuthQuery }>('/auth/twitch/callback', async (request, reply) => {
    const { code, state, error, error_description: errorDescription } = request.query;
    if (error) return reply.code(400).send({ error: errorDescription ?? error });
    if (!code || !state || !verifyOAuthState(state)) return reply.code(400).send({ error: 'Invalid Twitch OAuth state or missing code' });
    const exchanged = await exchangeCode(code);
    const identity = await validateAccessToken(exchanged.access_token);
    saveToken({
      userId: identity.user_id,
      login: identity.login,
      accessToken: exchanged.access_token,
      refreshToken: exchanged.refresh_token,
      scopes: exchanged.scope,
      expiresAt: Date.now() + exchanged.expires_in * 1000,
      rewardId: null,
    });
    await ensureReward(identity.user_id);
    reply.setCookie('uid', identity.user_id, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: config.PUBLIC_URL.startsWith('https://'),
      maxAge: 30 * 24 * 60 * 60,
    });
    return reply.redirect('/dash');
  });

  app.get('/api/me', async (request, reply) => {
    const cookie = request.unsignCookie(request.cookies.uid ?? '');
    if (!cookie.valid || !cookie.value) return reply.code(401).send({ error: 'Not connected' });
    const users = await getUsers(cookie.value, [cookie.value]);
    const user = users[0];
    if (!user) return reply.code(401).send({ error: 'Twitch user is unavailable' });
    const rewardId = await ensureReward(cookie.value);
    const overlayUrl = `${config.PUBLIC_URL.replace(/\/$/, '')}/overlay?token=${encodeURIComponent(createOverlayToken(cookie.value, config.SESSION_SECRET))}`;
    return { login: user.login, display_name: user.display_name, avatarUrl: user.profile_image_url, rewardId, rewardCost: config.DARE_COST_POINTS };
  });
}
