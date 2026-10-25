import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { helix } from './helix.js';

type JsonObject = Record<string, unknown>;
type EventName = 'redemption' | 'chatMessage' | 'cheer' | 'pollEnd' | 'streamOnline' | 'streamOffline' | 'reconnect' | 'revocation';
type EventListener = (...args: any[]) => void;

export interface RedemptionEvent {
  id: string;
  broadcaster_user_id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  user_input: string;
  status: 'unfulfilled' | 'fulfilled' | 'canceled';
  reward: { id: string; title: string; cost: number; prompt: string };
  redeemed_at: string;
}

export interface ChatMessageEvent {
  message_id: string;
  broadcaster_user_id: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message: { text: string; fragments: JsonObject[] };
  message_type: string;
  badges: JsonObject[];
  cheer?: { bits: number };
}

export interface CheerEvent {
  is_anonymous: boolean;
  user_id: string | null;
  user_login: string | null;
  user_name: string | null;
  broadcaster_user_id: string;
  message: string;
  bits: number;
}

export interface PollEndEvent {
  id: string;
  broadcaster_user_id: string;
  title: string;
  choices: Array<{ id: string; title: string; votes: number; channel_points_votes: number }>;
  status: 'completed' | 'archived' | 'terminated';
  started_at: string;
  ended_at: string;
}

export interface StreamOnlineEvent { id: string; broadcaster_user_id: string; type: string; started_at: string }
export interface StreamOfflineEvent { broadcaster_user_id: string }

interface EventSubEventMap {
  redemption: RedemptionEvent;
  chatMessage: ChatMessageEvent;
  cheer: CheerEvent;
  pollEnd: PollEndEvent;
  streamOnline: StreamOnlineEvent;
  streamOffline: StreamOfflineEvent;
  reconnect: string;
  revocation: JsonObject;
}

export interface EventSubSubscription {
  type: string;
  version: '1';
  condition: Record<string, string>;
}

export interface EventSubOptions {
  userId: string;
  broadcasterId: string;
  getAccessToken(): Promise<string>;
  websocketUrl?: string;
  subscribe?: (accessToken: string, subscription: EventSubSubscription) => Promise<void>;
  createWebSocket?: (url: string) => WebSocket;
}

const notificationEvents: Record<string, keyof EventSubEventMap> = {
  'channel.channel_points_custom_reward_redemption.add': 'redemption',
  'channel.chat.message': 'chatMessage',
  'channel.cheer': 'cheer',
  'channel.poll.end': 'pollEnd',
  'stream.online': 'streamOnline',
  'stream.offline': 'streamOffline',
};

export class EventSubClient extends EventEmitter {
  private readonly seen = new Set<string>();
  private socket: WebSocket | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private backoffAttempt = 0;
  private currentSessionId: string | null = null;
  private readonly subscribeRequest: (accessToken: string, subscription: EventSubSubscription) => Promise<void>;
  private readonly socketFactory: (url: string) => WebSocket;

  constructor(private readonly options: EventSubOptions) {
    super();
    this.subscribeRequest = options.subscribe ?? (async (accessToken, subscription) => {
      await helix(options.userId, 'POST', '/eventsub/subscriptions', {
        body: { ...subscription, transport: { method: 'websocket', session_id: this.currentSessionId } },
      });
      void accessToken;
    });
    this.socketFactory = options.createWebSocket ?? ((url) => new WebSocket(url));
  }

  override on<K extends EventName>(event: K, listener: (payload: EventSubEventMap[K]) => void): this {
    return super.on(event, listener as EventListener);
  }

  override once<K extends EventName>(event: K, listener: (payload: EventSubEventMap[K]) => void): this {
    return super.once(event, listener as EventListener);
  }

  get sessionId(): string | null {
    return this.currentSessionId;
  }

  start(): void {
    this.stopped = false;
    this.openSocket(this.options.websocketUrl ?? config.TWITCH_EVENTSUB_WS_URL);
  }

  stop(): void {
    this.stopped = true;
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.keepaliveTimer = null;
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  async handleMessage(raw: string): Promise<void> {
    await this.processMessage(raw);
  }

  private openSocket(url: string, replacing?: WebSocket): void {
    if (this.stopped) return;
    let socket: WebSocket;
    try {
      socket = this.socketFactory(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (!replacing) this.socket = socket;
    socket.addEventListener('message', (message) => {
      void this.processMessage(String(message.data), socket, replacing);
    });
    socket.addEventListener('close', () => {
      if ((this.socket === socket || replacing) && !this.stopped) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      if ((this.socket === socket || replacing) && !this.stopped) {
        socket.close();
        this.scheduleReconnect();
      }
    });
  }

  private async processMessage(raw: string, incomingSocket?: WebSocket, replacing?: WebSocket): Promise<void> {
    let envelope: JsonObject;
    try {
      envelope = JSON.parse(raw) as JsonObject;
    } catch {
      return;
    }
    this.armKeepaliveTimeout(incomingSocket ?? this.socket);
    const metadata = envelope.metadata as JsonObject | undefined;
    const payload = envelope.payload as JsonObject | undefined;
    const messageType = metadata?.message_type;
    if (messageType === 'session_welcome') {
      const session = payload?.session as JsonObject | undefined;
      if (typeof session?.id !== 'string') return;
      this.currentSessionId = session.id;
      this.backoffAttempt = 0;
      if (replacing && incomingSocket) {
        this.socket = incomingSocket;
        replacing.close();
        this.armKeepaliveTimeout(incomingSocket);
        return;
      }
      if (incomingSocket) this.socket = incomingSocket;
      await this.createSubscriptions();
      return;
    }
    if (messageType === 'session_keepalive') return;
    if (messageType === 'session_reconnect') {
      const session = payload?.session as JsonObject | undefined;
      const reconnectUrl = session?.reconnect_url;
      if (typeof reconnectUrl === 'string') {
        this.emit('reconnect', reconnectUrl);
        if (incomingSocket) this.openSocket(reconnectUrl, incomingSocket);
      }
      return;
    }
    if (messageType === 'revocation') {
      this.emit('revocation', (payload?.subscription ?? {}) as JsonObject);
      return;
    }
    if (messageType !== 'notification') return;
    const messageId = metadata?.message_id;
    if (typeof messageId === 'string') {
      if (this.seen.has(messageId)) return;
      this.seen.add(messageId);
      if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value as string);
    }
    const subscription = payload?.subscription as JsonObject | undefined;
    const event = payload?.event as JsonObject | undefined;
    const type = subscription?.type;
    const eventName = typeof type === 'string' ? notificationEvents[type] : undefined;
    if (eventName && event) this.emit(eventName, event);
  }

  private async createSubscriptions(): Promise<void> {
    const subscriptions: EventSubSubscription[] = [
      { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: this.options.broadcasterId } },
      { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.options.broadcasterId, user_id: this.options.userId } },
      { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: this.options.broadcasterId } },
      { type: 'channel.poll.end', version: '1', condition: { broadcaster_user_id: this.options.broadcasterId } },
      { type: 'stream.online', version: '1', condition: { broadcaster_user_id: this.options.broadcasterId } },
      { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: this.options.broadcasterId } },
    ];
    let token: string;
    try {
      token = await this.options.getAccessToken();
    } catch (error) {
      console.error('EventSub could not obtain an access token for subscriptions', error);
      return;
    }
    const results = await Promise.allSettled(subscriptions.map((subscription) => this.subscribeRequest(token, subscription)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`EventSub subscription failed for ${subscriptions[index]!.type}`, result.reason);
      }
    });
  }

  private armKeepaliveTimeout(socket: WebSocket | null): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      if (!this.stopped && socket && this.socket === socket) {
        socket.close();
        this.scheduleReconnect();
      }
    }, 30_000);
    this.keepaliveTimer.unref?.();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.backoffAttempt, 30_000);
    this.backoffAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(this.options.websocketUrl ?? config.TWITCH_EVENTSUB_WS_URL);
    }, delay);
    this.reconnectTimer.unref?.();
  }
}
