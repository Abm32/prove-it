import { parseOverlayQuery } from './query.js';
import { OverlayRenderer } from './render.js';
import type { OverlayState } from './view.js';

const root = document.querySelector<HTMLElement>('#app');
const query = parseOverlayQuery(location.search);
const renderer = root ? new OverlayRenderer(root, query) : null;
let state: OverlayState | null = null;
let receivedAt = Date.now();
let retryMs = 500;
let socket: WebSocket | null = null;
let connected = false;

function connect(): void {
  if (query.demo) return;
  const token = new URLSearchParams(location.search).get('token');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws/overlay${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  socket.onopen = () => { retryMs = 500; connected = true; };
  socket.onmessage = (event) => {
    try { state = JSON.parse(event.data) as OverlayState; receivedAt = Date.now(); }
    catch { /* Ignore malformed state payloads and keep the last good render. */ }
  };
  socket.onclose = () => {
    connected = false;
    window.setTimeout(connect, retryMs);
    retryMs = Math.min(10_000, retryMs * 2);
  };
  socket.onerror = () => socket?.close();
}

function demoState(at: number): OverlayState {
  const step = Math.floor(at / 4000) % 7;
  const statuses = ['IDLE', 'QUEUED', 'ACTIVE', 'APPEAL', 'POLL', 'PASS', 'FINAL_PASS'];
  const status = statuses[step]!;
  const active = step >= 2;
  const queued = step === 1;
  const current = active ? {
    id: 12, title: 'Balance a spoon on your nose for ten seconds', viewerLogin: 'pixelpilot', status,
    bountyBits: 500, bountyPoints: 0, deadlineAt: Date.now() + 67_000 - (at % 4000),
    appealCount: 2, appealThreshold: 3, appealRemainingMs: 18_000 - (at % 4000), pollRemainingMs: 41_000 - (at % 4000),
  } : null;
  return {
    current, status, remainingMs: current ? Math.max(0, current.deadlineAt! - Date.now()) : 0,
    latestTick: { progress: .78, confidence: .62, evidence: step > 2 ? 'The spoon is balanced on the streamer’s nose.' : 'A spoon is visible near the streamer’s face.' },
    queue: queued || active ? [{ id: 13, title: 'Say the alphabet backwards', viewerLogin: 'tinychaos', bountyBits: 250, bountyPoints: 0 }, { id: 14, title: 'Do a dramatic victory pose', viewerLogin: 'sidequest', bountyBits: 0, bountyPoints: 1000 }] : [],
    passRate: .71, lastClipUrl: 'https://www.twitch.tv/clip/InventiveDemoReceipt',
    leaderboard: [{ viewer_login: 'pixelpilot', dare_count: 12, bits: 4400 }],
  };
}

function frame(_frameTime: number): void {
  const now = Date.now();
  if (query.demo) { state = demoState(now - demoStarted); receivedAt = now; }
  if (state && renderer) renderer.render(state, now, query.demo || connected, receivedAt);
  requestAnimationFrame(frame);
}

const demoStarted = Date.now();
connect();
requestAnimationFrame(frame);
