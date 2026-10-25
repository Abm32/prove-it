import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { getUsers } from '../twitch/helix.js';
import { buildAuthorizeUrl, exchangeCode, validateAccessToken, verifyOAuthState } from '../twitch/oauth.js';
import { ensureReward } from '../twitch/setup.js';
import { saveToken } from '../twitch/tokenStore.js';
import { createOverlayToken } from './overlayToken.js';

export interface AuthRouteOptions {
  onConnected?: (userId: string, rewardId: string) => Promise<void> | void;
}

interface AuthQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function callbackError(reply: FastifyReply, message: string, status = 400) {
  return reply.code(status).type('text/html; charset=utf-8').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Twitch sign-in</title><body><main><h1>Could not connect Twitch</h1><p>${escapeHtml(message)}</p><a href="/auth/twitch">Try again</a></main></body></html>`);
}

export async function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions = {}): Promise<void> {
  app.get('/auth/twitch', async (_request, reply) => reply.redirect(buildAuthorizeUrl()));

  app.get<{ Querystring: AuthQuery }>('/auth/twitch/callback', async (request, reply) => {
    const { code, state, error, error_description: errorDescription } = request.query;
    if (error) return callbackError(reply, errorDescription ?? error);
    if (!code || !state || !verifyOAuthState(state)) return callbackError(reply, 'The sign-in link was missing or expired. Please try again.');
    try {
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
      const rewardId = await ensureReward(identity.user_id);
      await options.onConnected?.(identity.user_id, rewardId);
      reply.setCookie('uid', identity.user_id, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: config.PUBLIC_URL.startsWith('https://'),
        maxAge: 30 * 24 * 60 * 60,
      });
      return reply.redirect('/dash');
    } catch {
      return callbackError(reply, 'Twitch could not complete sign-in. Check your app credentials and try again.', 502);
    }
  });

  app.get('/api/me', async (request, reply) => {
    const cookie = request.unsignCookie(request.cookies.uid ?? '');
    if (!cookie.valid || !cookie.value) return reply.code(401).send({ error: 'not_connected' });
    const users = await getUsers(cookie.value, [cookie.value]);
    const user = users[0];
    if (!user) return reply.code(401).send({ error: 'not_connected' });
    const rewardId = await ensureReward(cookie.value);
    const overlayUrl = `${config.PUBLIC_URL.replace(/\/$/, '')}/overlay?token=${encodeURIComponent(createOverlayToken(cookie.value, config.SESSION_SECRET))}`;
    return { login: user.login, display_name: user.display_name, avatarUrl: user.profile_image_url, rewardId, rewardCost: config.DARE_COST_POINTS };
  });
}
