import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const TWITCH_SCOPES = [
  'channel:manage:redemptions',
  'channel:read:redemptions',
  'bits:read',
  'channel:manage:polls',
  'channel:read:polls',
  'user:read:chat',
  'user:write:chat',
  'user:bot',
  'channel:bot',
  'clips:edit',
  'channel:manage:broadcast',
  'moderator:manage:chat_messages',
];

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export interface ValidatedTwitchToken {
  client_id: string;
  login: string;
  scopes: string[];
  user_id: string;
  expires_in: number;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function createOAuthState(secret = config.SESSION_SECRET): string {
  const nonce = randomBytes(32).toString('base64url');
  return `${nonce}.${sign(nonce, secret)}`;
}

export function verifyOAuthState(state: string, secret = config.SESSION_SECRET): boolean {
  const [nonce, signature, extra] = state.split('.');
  if (!nonce || !signature || extra !== undefined) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(sign(nonce, secret), 'hex');
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function buildAuthorizeUrl(state = createOAuthState()): string {
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.TWITCH_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${config.PUBLIC_URL.replace(/\/$/, '')}/auth/twitch/callback`);
  url.searchParams.set('scope', TWITCH_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

async function oauthRequest<T>(params: URLSearchParams, path: string, accessToken?: string): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });
  if (accessToken) headers.set('Authorization', `OAuth ${accessToken}`);
  const response = await fetch(`https://id.twitch.tv/oauth2/${path}`, { method: 'POST', headers, body: params });
  const payload = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(`Twitch OAuth ${response.status}: ${payload.message ?? response.statusText}`);
  return payload;
}

export function exchangeCode(code: string): Promise<OAuthTokenResponse> {
  return oauthRequest(new URLSearchParams({
    client_id: config.TWITCH_CLIENT_ID,
    client_secret: config.TWITCH_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: `${config.PUBLIC_URL.replace(/\/$/, '')}/auth/twitch/callback`,
  }), 'token');
}

export function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  return oauthRequest(new URLSearchParams({
    client_id: config.TWITCH_CLIENT_ID,
    client_secret: config.TWITCH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }), 'token');
}

export async function validateAccessToken(accessToken: string): Promise<ValidatedTwitchToken> {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  const payload = await response.json() as ValidatedTwitchToken & { message?: string };
  if (!response.ok) throw new Error(`Twitch token validation ${response.status}: ${payload.message ?? response.statusText}`);
  return payload;
}
