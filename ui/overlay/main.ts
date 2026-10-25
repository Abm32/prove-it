import { stateToView, type OverlayState } from './view.js';

const root = document.querySelector<HTMLElement>('#app');
let state: OverlayState | null = null;
let receivedAt = Date.now();
let retryMs = 500;
let socket: WebSocket | null = null;
let verdictSince = 0;

function connect(): void {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws/overlay${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  socket.onopen = () => { retryMs = 500; };
  socket.onmessage = (event) => {
    try {
      state = JSON.parse(event.data) as OverlayState;
      receivedAt = Date.now();
      render();
    } catch { /* ignore bad state payloads */ }
  };
  socket.onclose = () => { setTimeout(connect, retryMs); retryMs = Math.min(10_000, retryMs * 2); };
  socket.onerror = () => socket?.close();
}

function render(): void {
  if (!root || !state) return;
  const view = stateToView(state, Date.now());
  const elapsed = Date.now() - receivedAt;
  const remaining = Math.max(0, view.remainingMs - (view.mode === 'active' ? 0 : elapsed));
  const seconds = remaining / 1000;
  if (view.mode === 'idle') {
    root.innerHTML = `<div class="badge">${escape(view.label)}</div>`;
    return;
  }
  if (view.mode === 'queued') {
    root.innerHTML = `<div class="toast">🎯 ${escape(view.viewer)} queued: ${escape(view.title)}</div>`;
    return;
  }
  if (view.mode === 'poll') {
    root.innerHTML = `<div class="bar">🗳️ Chat is voting… ${seconds.toFixed(1)}s</div>`;
    return;
  }
  if (view.mode === 'appeal') {
    root.innerHTML = `<div class="bar">!appeal ${escape(view.appeals)} · ${seconds.toFixed(1)}s</div>`;
    return;
  }
  if (view.mode === 'verdict') {
    const pass = view.label.includes('PASS');
    if (!verdictSince) verdictSince = Date.now();
    const held = Date.now() - verdictSince < 4000;
    root.innerHTML = `<div class="stamp ${pass ? 'pass' : 'fail'} ${view.label.startsWith('FINAL') ? 'final' : ''}">${pass ? '✓ PASS' : '✕ FAIL'}</div>${held ? '' : view.clipUrl ? `<a class="clip" href="${escape(view.clipUrl)}" target="_blank">Clip receipt ↗</a>` : ''}`;
    return;
  }
  verdictSince = 0;
  const bounty = state.current ? state.current.bountyBits ? `${state.current.bountyBits} bits` : `${state.current.bountyPoints} pts` : '';
  root.innerHTML = `<div class="card"><div class="meta">@${escape(view.viewer)} · ${bounty}</div><div class="title">${escape(view.title)}</div><div class="countdown"><span class="ring" style="--progress:${Math.max(0, Math.min(100, (seconds / 120) * 100)) * 3.6}deg"></span>${seconds.toFixed(3)}s</div><div class="meter"><i style="width:${Math.round(view.confidence * 100)}%"></i></div><div class="meta">REF CONFIDENCE ${Math.round(view.confidence * 100)}%</div><p class="evidence">${escape(view.evidence)}</p></div>`;
}

function escape(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
connect();
setInterval(render, 50);
