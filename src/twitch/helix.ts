import { config } from '../config.js';
import { forceRefreshToken, getValidToken } from './tokenStore.js';

export class HelixError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HelixError';
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type QueryValue = string | number | boolean;

export interface HelixOptions {
  query?: Record<string, QueryValue | QueryValue[] | undefined>;
  body?: unknown;
}

export interface HelixClientOptions {
  clientId: string;
  getToken(userId: string): Promise<string>;
  refreshToken(userId: string): Promise<string>;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  baseUrl?: string;
  eventSubSubscriptionUrl?: string;
}

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createHelixClient(deps: HelixClientOptions) {
  const fetcher = deps.fetch ?? fetch;
  const wait = deps.sleep ?? sleep;

  async function helix<T = unknown>(userId: string, method: HttpMethod, path: string, options: HelixOptions = {}): Promise<T> {
    let token = await deps.getToken(userId);
    let refreshed = false;
    let rateRetried = false;

    while (true) {
      const isSubscriptions = path === '/eventsub/subscriptions' && deps.eventSubSubscriptionUrl;
      const target = new URL(isSubscriptions ? deps.eventSubSubscriptionUrl! : `${deps.baseUrl ?? 'https://api.twitch.tv/helix'}${path}`);
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (Array.isArray(value)) value.forEach((item) => target.searchParams.append(key, String(item)));
        else if (value !== undefined) target.searchParams.set(key, String(value));
      }
      const headers = new Headers({
        Authorization: `Bearer ${token}`,
        'Client-Id': deps.clientId,
      });
      if (options.body !== undefined) headers.set('Content-Type', 'application/json');
      const response = await fetcher(target, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });

      if (response.status === 401 && !refreshed) {
        token = await deps.refreshToken(userId);
        refreshed = true;
        continue;
      }
      if (response.status === 429 && !rateRetried) {
        const reset = response.headers.get('Ratelimit-Reset');
        if (reset && Number.isFinite(Number(reset))) {
          await wait(Math.max(0, Number(reset) * 1000 - Date.now()));
          rateRetried = true;
          continue;
        }
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new HelixError(response.status, payload?.message ?? payload?.error ?? response.statusText);
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    }
  }

  return { helix };
}

const defaultClient = createHelixClient({
  clientId: config.TWITCH_CLIENT_ID,
  getToken: getValidToken,
  refreshToken: forceRefreshToken,
  eventSubSubscriptionUrl: config.TWITCH_EVENTSUB_SUB_URL,
});

export const helix = defaultClient.helix;

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  broadcaster_type: '' | 'affiliate' | 'partner';
}

export async function getUsers(userId: string, ids: string[]): Promise<TwitchUser[]> {
  const result = await helix<{ data: TwitchUser[] }>(userId, 'GET', '/users', { query: { id: ids } });
  return result.data;
}

export interface CustomReward {
  id: string;
  title: string;
  cost: number;
  prompt: string;
}

export async function createCustomReward(userId: string, broadcasterId: string, input: { title: string; cost: number; prompt: string }): Promise<CustomReward> {
  const result = await helix<{ data: CustomReward[] }>(userId, 'POST', '/channel_points/custom_rewards', {
    query: { broadcaster_id: broadcasterId },
    body: { ...input, is_user_input_required: true },
  });
  const reward = result.data[0];
  if (!reward) throw new HelixError(502, 'Twitch did not return the created reward');
  return reward;
}

export async function updateRedemptionStatus(userId: string, broadcasterId: string, rewardId: string, redemptionId: string, status: 'FULFILLED' | 'CANCELED'): Promise<void> {
  await helix(userId, 'PATCH', '/channel_points/custom_rewards/redemptions', {
    query: { broadcaster_id: broadcasterId, reward_id: rewardId, id: redemptionId },
    body: { status },
  });
}

export interface ChatMessageResult {
  data: Array<{ message_id: string; is_sent: boolean; drop_reason: { code: string; message: string } | null }>;
}

export async function sendChatMessage(userId: string, broadcasterId: string, senderId: string, message: string, replyParentMessageId?: string): Promise<ChatMessageResult> {
  return helix(userId, 'POST', '/chat/messages', {
    body: {
      broadcaster_id: broadcasterId,
      sender_id: senderId,
      message,
      ...(replyParentMessageId ? { reply_parent_message_id: replyParentMessageId } : {}),
    },
  });
}

export async function pinChatMessage(userId: string, broadcasterId: string, moderatorId: string, messageId: string, durationSeconds: number): Promise<boolean> {
  try {
    await helix(userId, 'POST', '/chat/messages/pin', {
      body: { broadcaster_id: broadcasterId, moderator_id: moderatorId, message_id: messageId, duration_seconds: durationSeconds },
    });
    return true;
  } catch {
    return false;
  }
}

export async function unpinChatMessage(userId: string, broadcasterId: string, moderatorId: string): Promise<void> {
  await helix(userId, 'DELETE', '/chat/messages/pin', { query: { broadcaster_id: broadcasterId, moderator_id: moderatorId } });
}

export interface CreatedClip { id: string; edit_url: string }
export interface TwitchClip extends CreatedClip { url?: string; embed_url?: string; broadcaster_id?: string }

export async function createClip(userId: string, broadcasterId: string): Promise<CreatedClip> {
  const result = await helix<{ data: CreatedClip[] }>(userId, 'POST', '/clips', { query: { broadcaster_id: broadcasterId, has_delay: false } });
  const clip = result.data[0];
  if (!clip) throw new HelixError(502, 'Twitch did not return a created clip');
  return clip;
}

export async function getClip(userId: string, clipId: string): Promise<TwitchClip | null> {
  const deadline = Date.now() + 20_000;
  do {
    const result = await helix<{ data: TwitchClip[] }>(userId, 'GET', '/clips', { query: { id: clipId } });
    const clip = result.data[0];
    if (clip?.url) return clip;
    if (Date.now() >= deadline) return null;
    await sleep(Math.min(1500, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  return null;
}

export async function createStreamMarker(userId: string, broadcasterId: string, description?: string): Promise<{ id: string; created_at: string; url: string }> {
  const result = await helix<{ data: Array<{ id: string; created_at: string; url: string }> }>(userId, 'POST', '/streams/markers', {
    body: { user_id: broadcasterId, ...(description ? { description } : {}) },
  });
  const marker = result.data[0];
  if (!marker) throw new HelixError(502, 'Twitch did not return a stream marker');
  return marker;
}

export async function createPoll(userId: string, broadcasterId: string, title: string, choices: string[], duration: number): Promise<{ id: string }> {
  const result = await helix<{ data: Array<{ id: string }> }>(userId, 'POST', '/polls', {
    body: { broadcaster_id: broadcasterId, title, choices: choices.map((choiceTitle) => ({ title: choiceTitle })), duration },
  });
  const poll = result.data[0];
  if (!poll) throw new HelixError(502, 'Twitch did not return the created poll');
  return poll;
}

export async function endPoll(userId: string, broadcasterId: string, pollId: string): Promise<void> {
  await helix(userId, 'PATCH', '/polls', { body: { broadcaster_id: broadcasterId, id: pollId, status: 'TERMINATED' } });
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  type: string;
  title: string;
  started_at: string;
}

export async function getStream(userId: string, broadcasterId: string): Promise<TwitchStream | null> {
  const result = await helix<{ data: TwitchStream[] }>(userId, 'GET', '/streams', { query: { user_id: broadcasterId } });
  return result.data[0] ?? null;
}
