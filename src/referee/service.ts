import type { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import type { ChatMessageEvent, EventSubClient, PollEndEvent, RedemptionEvent } from '../twitch/eventsub.js';
import { parseChatMessage } from '../twitch/parseChat.js';
import type { ParsedDare, ParsedDareSuccess } from '../ai/dareParser.js';
import type { JudgeTickInput } from '../ai/vision.js';
import { appeal as machineAppeal, advance as advanceMachine, createDareMachine, resolvePoll, start as startMachine, tick as machineTick, veto as machineVeto } from './machine.js';
import { DareQueue } from './queue.js';
import type { Dare, DareMachine, Tick } from './types.js';

export interface RefereeHelix {
  updateRedemptionStatus(userId: string, broadcasterId: string, rewardId: string, redemptionId: string, status: 'FULFILLED' | 'CANCELED'): Promise<void>;
  sendChatMessage(userId: string, broadcasterId: string, senderId: string, message: string): Promise<{ data?: Array<{ message_id?: string }> }>;
  pinChatMessage(userId: string, broadcasterId: string, moderatorId: string, messageId: string, durationSeconds: number): Promise<unknown>;
  unpinChatMessage(userId: string, broadcasterId: string, moderatorId: string): Promise<void>;
  createClip(userId: string, broadcasterId: string): Promise<{ id: string }>;
  getClip(userId: string, clipId: string): Promise<{ id: string; url?: string } | null>;
  createStreamMarker(userId: string, broadcasterId: string, description?: string): Promise<unknown>;
  getStream(userId: string, broadcasterId: string): Promise<{ id: string } | null>;
  createPoll(userId: string, broadcasterId: string, title: string, choices: string[], duration: number): Promise<{ id: string }>;
}

export interface RefereeAi {
  parseDare(text: string): Promise<ParsedDare>;
  judgeTick(input: JudgeTickInput): Promise<Tick>;
  transcribeChunk(buffer: Buffer, mime: string): Promise<string>;
}

export interface RefereeClock {
  now(): number;
  setInterval(callback: () => void, milliseconds: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
}

export interface RefereeServiceOptions {
  userId: string;
  rewardId: string;
  eventsub: EventSubClient;
  db: DatabaseSync;
  helix: RefereeHelix;
  ai: RefereeAi;
  clock?: RefereeClock;
  tickMs?: number;
}

export interface RefereePublicState {
  current: null | {
    id: number;
    text: string;
    title: string;
    viewerLogin: string;
    status: string;
    kind: string;
    bountyPoints: number;
    bountyBits: number;
  };
  status: string;
  remainingMs: number;
  latestTick: Pick<Tick, 'progress' | 'confidence' | 'evidence'> | null;
  queue: Array<{ id: number; text: string; title: string; viewerLogin: string; bountyBits: number; bountyPoints: number }>;
  leaderboard: Array<{ viewer_id: string; viewer_login: string; viewer_name: string; dare_count: number; bits: number; points: number }>;
  passRate: number;
  lastClipUrl: string | null;
  paused: boolean;
}

interface DareMetadata {
  title: string;
  redemptionId: string | null;
  redemptionRewardId: string | null;
}

interface TranscriptChunk { at: number; text: string }

const systemClock: RefereeClock = {
  now: () => Date.now(),
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (timer) => clearInterval(timer),
};

function successCondition(parsed: ParsedDareSuccess): Dare['condition'] {
  return {
    type: parsed.kind,
    condition: parsed.condition.successCriteria,
    count_target: parsed.condition.countTarget ?? null,
  };
}

export class RefereeService {
  private readonly queue = new DareQueue();
  private readonly metadata = new Map<number, DareMetadata>();
  private readonly listeners = new Set<(state: RefereePublicState) => void>();
  private readonly frames: Buffer[] = [];
  private readonly transcript: TranscriptChunk[] = [];
  private readonly clock: RefereeClock;
  private readonly tickMs: number;
  private current: DareMachine | null = null;
  private currentMetadata: DareMetadata | null = null;
  private pollId: string | null = null;
  private lastClipUrl: string | null = null;
  private paused = false;
  private pausedAt: number | null = null;
  private started = false;
  private ticking = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private advanceTimer: ReturnType<typeof setInterval> | null = null;
  private redemptionSettled = false;
  private passEffectsDone = false;
  private failEffectsDone = false;

  constructor(private readonly options: RefereeServiceOptions) {
    this.clock = options.clock ?? systemClock;
    this.tickMs = options.tickMs ?? config.TICK_MS;
  }

  get channelUserId(): string { return this.options.userId; }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.options.eventsub.on('redemption', (event) => { void this.onRedemption(event).catch(() => undefined); });
    this.options.eventsub.on('chatMessage', (event) => { void this.onChatMessage(event).catch(() => undefined); });
    this.options.eventsub.on('pollEnd', (event) => { void this.onPollEnd(event).catch(() => undefined); });
    this.tickTimer = this.clock.setInterval(() => { void this.runTick().catch(() => undefined); }, this.tickMs);
    this.advanceTimer = this.clock.setInterval(() => { void this.advance().catch(() => undefined); }, 500);
    void this.startNext().catch(() => undefined);
  }

  stop(): void {
    if (this.tickTimer) this.clock.clearInterval(this.tickTimer);
    if (this.advanceTimer) this.clock.clearInterval(this.advanceTimer);
    this.tickTimer = null;
    this.advanceTimer = null;
    this.started = false;
  }

  subscribe(listener: (state: RefereePublicState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getPublicState());
    return () => this.listeners.delete(listener);
  }

  async onRedemption(event: RedemptionEvent): Promise<void> {
    if (event.reward.id !== this.options.rewardId) return;
    await this.createDare({
      viewerId: event.user_id,
      viewerLogin: event.user_login,
      viewerName: event.user_name,
      text: event.user_input,
      bountyPoints: event.reward.cost,
      bountyBits: 0,
      redemptionId: event.id,
      redemptionRewardId: event.reward.id,
    });
  }

  async onChatMessage(event: ChatMessageEvent): Promise<void> {
    const parsedMessage = parseChatMessage(event);
    if (parsedMessage?.kind === 'dare') {
      await this.createDare({
        viewerId: event.chatter_user_id,
        viewerLogin: event.chatter_user_login,
        viewerName: event.chatter_user_name,
        text: parsedMessage.text,
        bountyPoints: 0,
        bountyBits: parsedMessage.bits,
        redemptionId: null,
        redemptionRewardId: null,
      });
      return;
    }
    if (parsedMessage?.kind === 'appeal') await this.submitAppeal(event.chatter_user_id);
  }

  async onPollEnd(event: PollEndEvent): Promise<void> {
    if (!this.current || this.current.status !== 'POLL' || !this.pollId || event.id !== this.pollId) return;
    const overruleVotes = event.choices
      .filter((choice) => choice.title.toLowerCase().startsWith('overrule'))
      .reduce((sum, choice) => sum + choice.votes, 0);
    const upholdVotes = event.choices
      .filter((choice) => choice.title.toLowerCase().startsWith('uphold'))
      .reduce((sum, choice) => sum + choice.votes, 0);
    this.current = resolvePoll(this.current, overruleVotes > upholdVotes, this.clock.now());
    this.persistMachine(this.current);
    if (this.current.status === 'FINAL_PASS') await this.settlePass(true);
    else {
      this.persistDecision(this.current);
      await this.completeCurrent();
    }
    this.broadcast();
  }

  async ingestFrame(jpeg: Buffer): Promise<void> {
    this.frames.push(jpeg);
    if (this.frames.length > 3) this.frames.shift();
  }

  async ingestAudio(buffer: Buffer, mime: string): Promise<string> {
    const text = await this.options.ai.transcribeChunk(buffer, mime);
    const at = this.clock.now();
    this.transcript.push({ at, text });
    this.pruneTranscript(at);
    return text;
  }

  async runTick(): Promise<void> {
    if (this.paused || this.ticking || !this.current || (this.current.status !== 'ACTIVE' && this.current.status !== 'JUDGING')) return;
    this.ticking = true;
    try {
      const current = this.current;
      const now = this.clock.now();
      this.pruneTranscript(now);
      const elapsedSec = Math.max(0, Math.floor((now - (current.startedAt ?? now)) / 1000));
      const remainingSec = Math.max(0, Math.ceil(((current.deadlineAt ?? now) - now) / 1000));
      const value = await this.options.ai.judgeTick({
        dare: current.dare,
        frames: [...this.frames],
        transcript: this.transcript.map((chunk) => chunk.text).join('\n'),
        elapsedSec,
        remainingSec,
        priorEvidence: current.history.slice(-5).map((tick) => tick.evidence),
      });
      if (!this.current || this.current.dare.id !== current.dare.id || (this.current.status !== 'ACTIVE' && this.current.status !== 'JUDGING')) return;
      const timedTick = { ...value, at: this.clock.now() };
      this.options.db.prepare(`INSERT INTO verdict_ticks (dare_id, at, progress, confidence, done, evidence)
        VALUES (?, ?, ?, ?, ?, ?)`).run(current.dare.id, timedTick.at, timedTick.progress, timedTick.confidence, timedTick.done ? 1 : 0, timedTick.evidence);
      this.current = machineTick(this.current, timedTick);
      this.persistMachine(this.current);
      if (this.current.status === 'PASS' && !this.passEffectsDone) await this.settlePass(false);
      if (this.current.status === 'FAIL' && !this.failEffectsDone) await this.settleFail();
      this.broadcast();
    } finally {
      this.ticking = false;
    }
  }

  async advance(now = this.clock.now()): Promise<void> {
    if (this.paused) return;
    if (!this.current) {
      await this.startNext();
      return;
    }
    const previousStatus = this.current.status;
    this.current = advanceMachine(this.current, now);
    if (this.current.status !== previousStatus) {
      this.persistMachine(this.current);
      if (this.current.status === 'FAIL' && !this.failEffectsDone) await this.settleFail();
      if (this.current.status === 'FINAL_PASS') {
        if (!this.passEffectsDone) await this.settlePass(false);
        await this.completeCurrent();
      } else if (this.current.status === 'FINAL_FAIL') {
        this.persistDecision(this.current);
        await this.completeCurrent();
      }
      this.broadcast();
    }
  }

  async veto(): Promise<void> {
    if (!this.current) return;
    this.current = machineVeto(this.current);
    this.persistMachine(this.current);
    if (this.current.dare.id && this.currentMetadata?.redemptionId && this.currentMetadata.redemptionRewardId) {
      await this.safe(() => this.options.helix.updateRedemptionStatus(this.options.userId, this.options.userId, this.currentMetadata!.redemptionRewardId!, this.currentMetadata!.redemptionId!, 'CANCELED'));
    }
    await this.sendChat(`⏭️ Dare #${this.current.dare.id} skipped by the streamer.`);
    await this.unpin();
    await this.completeCurrent();
    this.broadcast();
  }

  async skip(): Promise<void> { await this.veto(); }

  setPaused(value: boolean): void {
    if (value === this.paused) return;
    const now = this.clock.now();
    if (value) {
      this.pausedAt = now;
    } else if (this.pausedAt !== null && this.current) {
      const duration = now - this.pausedAt;
      this.current = {
        ...this.current,
        deadlineAt: this.current.deadlineAt === null ? null : this.current.deadlineAt + duration,
        decidedAt: this.current.decidedAt === null ? null : this.current.decidedAt + duration,
      };
      this.persistMachine(this.current);
      this.pausedAt = null;
    } else {
      this.pausedAt = null;
    }
    this.paused = value;
    if (!value) void this.startNext().catch(() => undefined);
    this.broadcast();
  }

  getPublicState(): RefereePublicState {
    const current = this.current;
    const metadata = current ? this.metadata.get(current.dare.id) ?? this.currentMetadata : null;
    const queue = this.queue.preview(3).map((dare) => ({
      id: dare.id,
      text: dare.text,
      title: this.metadata.get(dare.id)?.title ?? dare.text,
      viewerLogin: dare.viewerLogin,
      bountyBits: dare.bountyBits,
      bountyPoints: dare.bountyPoints,
    }));
    const leaderboard = this.options.db.prepare(`SELECT viewer_id, viewer_login, viewer_name,
      COUNT(*) AS dare_count, COALESCE(SUM(bounty_bits), 0) AS bits, COALESCE(SUM(bounty_points), 0) AS points
      FROM dares GROUP BY viewer_id ORDER BY dare_count DESC, bits DESC LIMIT 5`).all() as RefereePublicState['leaderboard'];
    const totals = this.options.db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) AS passed
      FROM dares WHERE status IN ('FINAL_PASS', 'FINAL_FAIL')`).get() as { total: number; passed: number | null };
    const lastClip = this.options.db.prepare(`SELECT clip_url FROM dares WHERE clip_url IS NOT NULL ORDER BY decided_at DESC LIMIT 1`).get() as { clip_url: string } | undefined;
    const latest = current?.history.at(-1);
    return {
      current: current ? {
        id: current.dare.id,
        text: current.dare.text,
        title: metadata?.title ?? current.dare.text,
        viewerLogin: current.dare.viewerLogin,
        status: current.status,
        kind: current.dare.kind,
        bountyPoints: current.dare.bountyPoints,
        bountyBits: current.dare.bountyBits,
      } : null,
      status: current?.status ?? 'IDLE',
      remainingMs: current?.deadlineAt === null || current?.deadlineAt === undefined ? 0 : Math.max(0, current.deadlineAt - (this.paused ? this.pausedAt ?? this.clock.now() : this.clock.now())),
      latestTick: latest ? { progress: latest.progress, confidence: latest.confidence, evidence: latest.evidence } : null,
      queue,
      leaderboard,
      passRate: totals.total ? (totals.passed ?? 0) / totals.total : 0,
      lastClipUrl: this.lastClipUrl ?? lastClip?.clip_url ?? null,
      paused: this.paused,
    };
  }

  getDares(limit = 50): unknown[] {
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    return this.options.db.prepare(`SELECT id, viewer_login, viewer_name, text, kind, bounty_points, bounty_bits,
      status, created_at, started_at, decided_at, verdict, evidence, clip_url
      FROM dares WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?`).all(this.options.userId, safeLimit);
  }

  private async createDare(input: {
    viewerId: string; viewerLogin: string; viewerName: string; text: string;
    bountyPoints: number; bountyBits: number; redemptionId: string | null; redemptionRewardId: string | null;
  }): Promise<void> {
    const parsed = await this.options.ai.parseDare(input.text);
    if (!parsed.ok) {
      if (input.redemptionId && input.redemptionRewardId) {
        await this.safe(() => this.options.helix.updateRedemptionStatus(this.options.userId, this.options.userId, input.redemptionRewardId!, input.redemptionId!, 'CANCELED'));
      }
      await this.sendChat(`❌ @${input.viewerLogin} dare rejected: ${parsed.reason}`);
      return;
    }
    const run = this.options.db.prepare(`INSERT INTO dares
      (channel_id, viewer_id, viewer_login, viewer_name, text, kind, condition_json, bounty_points, bounty_bits,
       status, created_at, redemption_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?)`).run(
      this.options.userId,
      input.viewerId,
      input.viewerLogin,
      input.viewerName,
      input.text,
      parsed.kind,
      JSON.stringify(parsed.condition),
      input.bountyPoints,
      input.bountyBits,
      this.clock.now(),
      input.redemptionId,
    );
    const id = Number(run.lastInsertRowid);
    const dare: Dare = {
      id,
      channelId: this.options.userId,
      viewerId: input.viewerId,
      viewerLogin: input.viewerLogin,
      viewerName: input.viewerName,
      text: input.text,
      kind: parsed.kind,
      condition: successCondition(parsed),
      bountyPoints: input.bountyPoints,
      bountyBits: input.bountyBits,
      createdAt: this.clock.now(),
      durationSec: parsed.condition.durationSec,
    };
    const metadata: DareMetadata = { title: parsed.cleanTitle, redemptionId: input.redemptionId, redemptionRewardId: input.redemptionRewardId };
    this.metadata.set(id, metadata);
    this.queue.push(dare);
    await this.sendChat(`🎯 Dare #${id} queued by @${input.viewerLogin}: ${parsed.cleanTitle}`);
    await this.startNext();
    this.broadcast();
  }

  private async startNext(): Promise<void> {
    if (this.paused || this.current) return;
    const dare = this.queue.next();
    if (!dare) return;
    this.currentMetadata = this.metadata.get(dare.id) ?? null;
    this.redemptionSettled = false;
    this.passEffectsDone = false;
    this.failEffectsDone = false;
    this.pollId = null;
    this.current = startMachine(createDareMachine(dare), this.clock.now());
    this.options.db.prepare('UPDATE dares SET status = ?, started_at = ?, deadline_at = ? WHERE id = ?')
      .run(this.current.status, this.current.startedAt, this.current.deadlineAt, dare.id);
    const title = this.currentMetadata?.title ?? dare.text;
    const sent = await this.sendChat(`🎯 Dare #${dare.id} by @${dare.viewerLogin}: ${title} — referee watching`);
    const messageId = sent?.data?.[0]?.message_id;
    if (messageId) await this.safe(() => this.options.helix.pinChatMessage(this.options.userId, this.options.userId, this.options.userId, messageId, dare.durationSec));
    this.broadcast();
  }

  private async submitAppeal(viewerId: string): Promise<void> {
    if (!this.current) return;
    const previous = this.current;
    this.current = machineAppeal(this.current, viewerId, this.clock.now());
    if (this.current.appeals.length > previous.appeals.length) {
      this.options.db.prepare('INSERT OR IGNORE INTO appeals (dare_id, viewer_id, at) VALUES (?, ?, ?)')
        .run(this.current.dare.id, viewerId, this.clock.now());
    }
    this.persistMachine(this.current);
    if (this.current.status === 'POLL') {
      const poll = await this.options.helix.createPoll(this.options.userId, this.options.userId,
        `Overrule the ref on dare #${this.current.dare.id}?`, ["Overrule — it's a PASS", 'Uphold — FAIL stands'], 60);
      this.pollId = poll.id;
      this.options.db.prepare('UPDATE dares SET poll_id = ? WHERE id = ?').run(poll.id, this.current.dare.id);
      await this.sendChat(`🗳️ Appeal poll is live for dare #${this.current.dare.id}.`);
    }
    this.broadcast();
  }

  private async settlePass(overruled: boolean): Promise<void> {
    if (!this.current || !this.currentMetadata || this.passEffectsDone) return;
    this.passEffectsDone = true;
    const dare = this.current.dare;
    if (!this.redemptionSettled && this.currentMetadata.redemptionId && this.currentMetadata.redemptionRewardId) {
      await this.safe(() => this.options.helix.updateRedemptionStatus(this.options.userId, this.options.userId, this.currentMetadata!.redemptionRewardId!, this.currentMetadata!.redemptionId!, 'FULFILLED'));
      this.redemptionSettled = true;
    }
    let clipId: string | null = null;
    let clipUrl: string | null = null;
    let evidence = this.current.history.at(-1)?.evidence ?? '';
    let live = false;
    try { live = Boolean(await this.options.helix.getStream(this.options.userId, this.options.userId)); } catch { live = false; }
    if (live) {
      try {
        const clip = await this.options.helix.createClip(this.options.userId, this.options.userId);
        clipId = clip.id;
        const ready = await this.options.helix.getClip(this.options.userId, clip.id);
        clipUrl = ready?.url ?? null;
      } catch { /* Clip creation is best-effort; the verdict remains final. */ }
    } else {
      evidence = `${evidence}${evidence ? ' ' : ''}No live stream available; no clip created.`.slice(0, 240);
      const history = [...this.current.history];
      const latest = history.at(-1);
      if (latest) history[history.length - 1] = { ...latest, evidence };
      this.current = { ...this.current, history };
    }
    try {
      await this.options.helix.createStreamMarker(this.options.userId, this.options.userId,
        `PROVE IT #${dare.id} PASS: ${this.currentMetadata.title}`);
    } catch { /* Markers require a live stream and enabled VOD. */ }
    this.lastClipUrl = clipUrl ?? this.lastClipUrl;
    this.options.db.prepare(`UPDATE dares SET status = ?, verdict = 'PASS', decided_at = ?, clip_id = ?, clip_url = ?, evidence = ? WHERE id = ?`)
      .run(this.current.status, this.current.decidedAt, clipId, clipUrl, evidence, dare.id);
    const prefix = overruled ? `⚖️ Chat overruled the ref — @${dare.viewerLogin}: ${this.currentMetadata.title}` : `✅ @${dare.viewerLogin} PROVED IT — ${this.currentMetadata.title}`;
    await this.sendChat(`${prefix}.${clipUrl ? ` Clip: ${clipUrl}` : ''}`);
    await this.unpin();
    this.broadcast();
  }

  private async settleFail(): Promise<void> {
    if (!this.current || this.failEffectsDone) return;
    this.failEffectsDone = true;
    const dare = this.current.dare;
    if (!this.redemptionSettled && this.currentMetadata?.redemptionId && this.currentMetadata.redemptionRewardId) {
      // A failed attempt is fulfilled: the streamer attempted the challenge, so its Channel Points stay spent.
      await this.safe(() => this.options.helix.updateRedemptionStatus(this.options.userId, this.options.userId, this.currentMetadata!.redemptionRewardId!, this.currentMetadata!.redemptionId!, 'FULFILLED'));
      this.redemptionSettled = true;
    }
    const evidence = this.current.history.at(-1)?.evidence ?? 'The challenge was not clearly completed before time ran out.';
    this.options.db.prepare(`UPDATE dares SET status = ?, verdict = 'FAIL', decided_at = ?, confidence = ?, evidence = ? WHERE id = ?`)
      .run(this.current.status, this.current.decidedAt, this.current.history.at(-1)?.confidence ?? 0, evidence, dare.id);
    await this.sendChat(`❌ Dare #${dare.id} FAILED: ${evidence}. Type !appeal in 30 s to overrule the ref`);
    await this.unpin();
  }

  private async completeCurrent(): Promise<void> {
    if (!this.current) return;
    this.queue.finish();
    this.current = null;
    this.currentMetadata = null;
    this.pollId = null;
    this.redemptionSettled = false;
    this.passEffectsDone = false;
    this.failEffectsDone = false;
    await this.startNext();
  }

  private persistMachine(machine: DareMachine): void {
    const latest = machine.history.at(-1);
    this.options.db.prepare(`UPDATE dares SET status = ?, started_at = ?, deadline_at = ?, decided_at = ?, verdict = ?,
      confidence = ?, evidence = ? WHERE id = ?`).run(
      machine.status,
      machine.startedAt,
      machine.deadlineAt,
      machine.decidedAt,
      machine.verdict,
      latest?.confidence ?? null,
      latest?.evidence ?? null,
      machine.dare.id,
    );
  }

  private persistDecision(machine: DareMachine): void {
    this.options.db.prepare('UPDATE dares SET status = ?, verdict = ?, decided_at = ? WHERE id = ?')
      .run(machine.status, machine.verdict, machine.decidedAt, machine.dare.id);
  }

  private async unpin(): Promise<void> {
    await this.safe(() => this.options.helix.unpinChatMessage(this.options.userId, this.options.userId, this.options.userId));
  }

  private async sendChat(message: string): Promise<{ data?: Array<{ message_id?: string }> } | undefined> {
    try { return await this.options.helix.sendChatMessage(this.options.userId, this.options.userId, this.options.userId, message); }
    catch { return undefined; }
  }

  private async safe<T>(action: () => Promise<T>): Promise<T | undefined> {
    try { return await action(); } catch { return undefined; }
  }

  private pruneTranscript(now: number): void {
    while (this.transcript.length && this.transcript[0]!.at < now - 15_000) this.transcript.shift();
  }

  private broadcast(): void {
    const state = this.getPublicState();
    for (const listener of this.listeners) listener(state);
  }
}
