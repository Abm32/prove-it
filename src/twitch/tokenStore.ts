import { db } from '../db.js';
import { refreshAccessToken } from './oauth.js';

export interface StoredToken {
  userId: string;
  login: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: number;
  rewardId: string | null;
}

interface TokenRow {
  user_id: string;
  login: string;
  access_token: string;
  refresh_token: string;
  scopes: string;
  expires_at: number;
  reward_id: string | null;
}

function mapRow(row: TokenRow | undefined): StoredToken | null {
  if (!row) return null;
  return {
    userId: row.user_id,
    login: row.login,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    scopes: JSON.parse(row.scopes) as string[],
    expiresAt: row.expires_at,
    rewardId: row.reward_id,
  };
}

export function getToken(userId: string): StoredToken | null {
  return mapRow(db.prepare('SELECT * FROM tokens WHERE user_id = ?').get(userId) as TokenRow | undefined);
}

export function saveToken(token: StoredToken): void {
  db.prepare(`INSERT INTO tokens (user_id, login, access_token, refresh_token, scopes, expires_at, reward_id)
    VALUES (@user_id, @login, @access_token, @refresh_token, @scopes, @expires_at, @reward_id)
    ON CONFLICT(user_id) DO UPDATE SET login=excluded.login, access_token=excluded.access_token,
      refresh_token=excluded.refresh_token, scopes=excluded.scopes, expires_at=excluded.expires_at,
      reward_id=COALESCE(excluded.reward_id, tokens.reward_id)`).run({
    user_id: token.userId,
    login: token.login,
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    scopes: JSON.stringify(token.scopes),
    expires_at: token.expiresAt,
    reward_id: token.rewardId,
  });
}

export function setRewardId(userId: string, rewardId: string): void {
  db.prepare('UPDATE tokens SET reward_id = ? WHERE user_id = ?').run(rewardId, userId);
}

export async function getValidToken(userId: string, now = Date.now()): Promise<string> {
  const token = getToken(userId);
  if (!token) throw new Error(`No Twitch token stored for user ${userId}`);
  if (token.expiresAt >= now + 5 * 60 * 1000) return token.accessToken;
  const refreshed = await refreshAccessToken(token.refreshToken);
  saveToken({
    ...token,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || token.refreshToken,
    scopes: refreshed.scope?.length ? refreshed.scope : token.scopes,
    expiresAt: now + refreshed.expires_in * 1000,
  });
  return refreshed.access_token;
}

export async function forceRefreshToken(userId: string): Promise<string> {
  const token = getToken(userId);
  if (!token) throw new Error(`No Twitch token stored for user ${userId}`);
  const refreshed = await refreshAccessToken(token.refreshToken);
  saveToken({
    ...token,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || token.refreshToken,
    scopes: refreshed.scope?.length ? refreshed.scope : token.scopes,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  });
  return refreshed.access_token;
}
