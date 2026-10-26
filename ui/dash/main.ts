import { startCapture, type CaptureController, type CaptureStatus } from './capture.js';

interface State {
  current: null | { id: number; title: string; text: string; viewerLogin: string; status: string; bountyPoints: number; bountyBits: number; deadlineAt: number | null; appealCount: number; appealThreshold: number };
  status: string; remainingMs: number; latestTick: null | { progress: number; confidence: number; evidence: string };
  queue: Array<{ id: number; title: string; viewerLogin: string; bountyBits: number; bountyPoints: number }>;
  leaderboard: Array<{ viewer_login: string; dare_count: number; bits: number; points: number }>;
  passRate: number; lastClipUrl: string | null; paused: boolean;
  captureActive: boolean; lastFrameAt: number | null; devMode?: boolean;
}

const app = document.querySelector<HTMLElement>('#app');
if (app) app.innerHTML = `
    <header><div><p class="eyebrow">PROVE IT / CONTROL ROOM</p><h1>Stream referee</h1></div><div class="header-pills"><span id="mode-pill" class="pill">— MODE</span><span id="connection" class="pill">Connecting…</span></div></header>
  <main>
    <nav class="onboarding" aria-label="Setup progress"><a class="step" id="step-connect" href="#connect"><span class="step-number">1</span><span><b>Connect Twitch</b><small>Authorize your channel</small></span><i>✓</i></a><span class="step-link"></span><a class="step" id="step-overlay" href="#overlay"><span class="step-number">2</span><span><b>Paste overlay URL into OBS</b><small>Browser Source · 1920 × 1080</small></span><i>✓</i></a><span class="step-link"></span><a class="step" id="step-referee" href="#referee"><span class="step-number">3</span><span><b>Start referee</b><small>Share screen and audio</small></span><i>✓</i></a></nav>
    <section class="panel" id="connect"><div class="section-head"><h2>Connect</h2><a id="connect-button" class="button primary" href="/auth/twitch">Connect Twitch</a></div><p id="connect-status" class="connect-status">Checking Twitch connection…</p><p id="identity">Connect your Twitch channel to set up PROVE IT.</p><small id="reward"></small><p id="where-chat" class="where-chat" hidden></p></section>
    <section class="panel" id="overlay"><div class="section-head"><h2>Overlay</h2><a class="preview-link" href="/overlay/?demo=1&amp;scale=0.5" target="_blank" rel="noreferrer">Preview overlay ↗</a></div><div class="url-row"><input id="overlay-url" readonly placeholder="Connect Twitch to get your overlay URL"><button id="copy-overlay">Copy URL</button></div><p class="hint">OBS → Browser Source → 1920×1080</p></section>
    <section class="panel" id="referee"><div class="section-head"><div><h2>Referee</h2><p class="hint">Share your display and system audio. The referee samples one frame each second.</p></div><div class="referee-buttons"><button id="test-dare" class="button" hidden>Test dare</button><button id="capture-button" class="primary">Start referee</button></div></div><div id="capture-status" class="capture-status"><span class="dot"></span><span>Referee idle</span><span>0 fps</span><span>— latency</span></div></section>
    <section class="panel"><div class="section-head"><h2>Now</h2><span id="status-pill" class="pill">IDLE</span></div><div id="now-card" class="empty">No dare is active. Start the referee and let chat dare you.</div><div class="actions"><button id="veto">Veto <kbd>V</kbd></button><button id="skip">Skip <kbd>S</kbd></button><button id="pause">Pause <kbd>P</kbd></button></div></section>
    <section class="panel"><h2>Queue <span id="queue-count" class="muted">0</span></h2><ol id="queue-list" class="list"></ol></section>
    <section class="panel"><h2>History</h2><div id="history-list" class="history empty">No completed dares yet.</div></section>
    <footer class="dash-footer"><span>PROVE IT / REFEREE CONTROL</span><a href="/overlay/?demo=1&amp;scale=0.5" target="_blank" rel="noreferrer">Preview overlay ↗</a></footer>
  </main>`;

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
let capture: CaptureController | null = null;
let latestState: State | null = null;
let ws: WebSocket | null = null;
let retry = 500;
let channelConnected = false;
let captureActive = false;
let localCaptureStatus: CaptureStatus | null = null;

async function loadIdentity(): Promise<void> {
  try {
    const response = await fetch('/api/me', { credentials: 'include' });
    if (response.status === 401) { showDisconnected(); return; }
    if (!response.ok) throw new Error(`Could not load Twitch connection (${response.status})`);
    const me = await response.json() as { login: string; display_name: string; avatarUrl: string; overlayUrl: string; rewardId: string | null; rewardCost: number; mode: 'points' | 'chat'; capabilities: { channelPoints: boolean; bits: boolean; clips: boolean; polls: boolean; mode: 'points' | 'chat' } };
    const identity = $('#identity');
    const avatar = document.createElement('img'); avatar.src = me.avatarUrl; avatar.alt = ''; avatar.width = 38; avatar.height = 38; avatar.style.cssText = 'border-radius:50%;vertical-align:middle;margin-right:10px';
    identity.replaceChildren(avatar, document.createTextNode(`@${me.login}`));
    $('#connect-status').textContent = `Connected as ${me.display_name}`;
    $('#connect-status').classList.add('connected');
    const connectButton = $('#connect-button');
    connectButton.textContent = 'Reconnect';
    connectButton.classList.remove('primary');
    $('#mode-pill').textContent = me.mode === 'chat' ? 'CHAT MODE' : 'POINTS MODE';
    $('#reward').textContent = me.mode === 'chat'
      ? 'Chat mode — channel is not Affiliate. Viewers type !dare <challenge> (free). Jury runs in chat (!overrule / !uphold). Receipts are stream markers.'
      : `Channel Points reward ready · ${me.rewardCost.toLocaleString()} pts · ${me.rewardId}`;
    const chatHelp = $('#where-chat');
    const chatLink = document.createElement('a');
    chatLink.href = `https://www.twitch.tv/popout/${encodeURIComponent(me.login)}/chat`;
    chatLink.target = '_blank';
    chatLink.rel = 'noreferrer';
    chatLink.textContent = 'Open your chat ↗';
    const command = document.createElement('code');
    command.textContent = me.mode === 'chat'
      ? '!dare <challenge>'
      : `redeem Dare the streamer (${me.rewardCost.toLocaleString()} pts) plus !dare with Bits`;
    chatHelp.hidden = false;
    chatHelp.replaceChildren(document.createTextNode('Where chat types: '), chatLink, document.createTextNode(' · Try '), command);
    ($('#overlay-url') as HTMLInputElement).value = me.overlayUrl;
    channelConnected = true;
    updateSteps();
  } catch {
    showDisconnected('Could not check Twitch connection. Try reconnecting.');
  }
}

function showDisconnected(message = 'Not connected yet'): void {
  channelConnected = false;
  $('#mode-pill').textContent = 'NO CHANNEL';
  $('#connect-status').textContent = message;
  $('#connect-status').classList.remove('connected');
  $('#identity').textContent = 'Connect your Twitch channel to set up PROVE IT.';
  $('#reward').textContent = '';
  $('#where-chat').hidden = true;
  const connectButton = $('#connect-button');
  connectButton.textContent = 'Connect Twitch';
  connectButton.classList.add('primary');
  updateSteps();
}

function updateSteps(): void {
  $('#step-connect').classList.toggle('done', channelConnected);
  $('#step-overlay').classList.toggle('done', Boolean(($('#overlay-url') as HTMLInputElement).value));
  $('#step-referee').classList.toggle('done', captureActive);
}

function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws/overlay`);
  ws.onopen = () => { retry = 500; $('#connection').textContent = 'Live'; $('#connection').classList.add('live'); };
  ws.onmessage = (event) => { try { render(JSON.parse(event.data) as State); } catch { /* ignore malformed state */ } };
  ws.onclose = () => { $('#connection').textContent = 'Reconnecting…'; $('#connection').classList.remove('live'); setTimeout(connect, retry); retry = Math.min(10_000, retry * 2); };
  ws.onerror = () => ws?.close();
}

function render(state: State): void {
  latestState = state;
  captureActive = state.captureActive;
  updateSteps();
  renderCaptureStatus();
  $('#status-pill').textContent = state.status;
  const card = $('#now-card');
  if (!state.current) { card.className = 'empty'; card.textContent = 'No dare is active.'; }
  else {
    const c = state.current;
    card.className = 'dare-card';
    card.innerHTML = `<div class="dare-meta">#${c.id} · @${escapeHtml(c.viewerLogin)} · ${c.bountyBits ? `${c.bountyBits} bits` : `${c.bountyPoints} pts`}</div><h3></h3><p class="dare-text"></p><div class="timer">${Math.ceil(state.remainingMs / 1000)}s remaining</div><div class="meter"><i style="width:${Math.round((state.latestTick?.confidence ?? 0) * 100)}%"></i></div><p class="evidence"></p>`;
    card.querySelector('h3')!.textContent = c.title;
    card.querySelector('.dare-text')!.textContent = c.text;
    card.querySelector('.evidence')!.textContent = state.latestTick?.evidence ?? 'Waiting for evidence…';
  }
  $('#queue-count').textContent = String(state.queue.length);
  const list = $('#queue-list');
  list.replaceChildren(...(state.queue.length ? state.queue.map((item) => { const li = document.createElement('li'); li.innerHTML = `<strong>#${item.id} · @${escapeHtml(item.viewerLogin)}</strong><span></span>`; li.querySelector('span')!.textContent = item.title; return li; }) : [Object.assign(document.createElement('li'), { textContent: 'Queue is empty.' })]));
  $('#pause').textContent = state.paused ? 'Resume' : 'Pause';
  void loadHistory();
}

function renderCaptureStatus(): void {
  const node = $('#capture-status');
  const lastFrameAt = latestState?.lastFrameAt ?? null;
  if (!captureActive) {
    node.innerHTML = '<span class="dot"></span><span>Referee idle</span><span>0 fps</span><span>— latency</span>';
    return;
  }
  const fps = localCaptureStatus?.watching ? `${localCaptureStatus.fps} fps` : 'remote frames';
  const latency = localCaptureStatus?.watching && localCaptureStatus.latencyMs !== null ? `${localCaptureStatus.latencyMs} ms latency` : lastFrameAt === null ? 'frame active' : `last frame ${Math.floor(Math.max(0, Date.now() - lastFrameAt) / 1000)}s ago`;
  node.innerHTML = `<span class="dot on"></span><span>Referee receiving frames (from this or another tab)</span><span>${escapeHtml(fps)}</span><span>${escapeHtml(latency)}</span>`;
}

async function loadRuntimeState(): Promise<void> {
  try {
    const response = await fetch('/api/state', { credentials: 'include' });
    if (!response.ok) return;
    const state = await response.json() as State;
    $('#test-dare').hidden = state.devMode !== true;
    render(state);
  } catch { /* State updates arrive over the WebSocket when available. */ }
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
async function loadHistory(): Promise<void> {
  const response = await fetch('/api/dares?limit=10', { credentials: 'include' });
  if (!response.ok) return;
  const data = await response.json() as { dares: Array<{ id: number; viewer_login: string; text: string; verdict: string | null; status: string; clip_url: string | null }> };
  const node = $('#history-list');
  if (!data.dares.length) { node.className = 'history empty'; node.textContent = 'No completed dares yet.'; return; }
  node.className = 'history';
  node.innerHTML = data.dares.map((dare) => `<div class="history-row"><span class="verdict ${dare.verdict === 'PASS' ? 'pass' : dare.verdict === 'FAIL' ? 'fail' : ''}">${escapeHtml(dare.verdict ?? dare.status)}</span><span>@${escapeHtml(dare.viewer_login)} · ${escapeHtml(dare.text)}</span>${dare.clip_url ? `<a href="${escapeHtml(dare.clip_url)}" target="_blank" rel="noreferrer">Clip ↗</a>` : ''}</div>`).join('');
}

$('#copy-overlay').addEventListener('click', () => { const input = $('#overlay-url') as HTMLInputElement; if (input.value) void navigator.clipboard.writeText(input.value); });
$('#capture-button').addEventListener('click', async () => {
  const button = $('#capture-button') as HTMLButtonElement;
  if (capture) { capture.stop(); capture = null; button.textContent = 'Start referee'; return; }
  button.disabled = true;
  try {
    capture = await startCapture((status: CaptureStatus) => {
      localCaptureStatus = status;
      if (!status.watching) { capture = null; button.textContent = 'Start referee'; }
      renderCaptureStatus();
      updateSteps();
    });
    button.textContent = 'Stop referee';
    updateSteps();
  } catch (error) { alert(error instanceof Error ? error.message : 'Could not start capture'); }
  finally { button.disabled = false; }
});
$('#test-dare').addEventListener('click', async () => {
  const button = $('#test-dare') as HTMLButtonElement;
  button.disabled = true;
  try {
    const response = await fetch('/api/dev/dare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ viewer: 'streamer', text: 'wave at the camera' }) });
    if (!response.ok) throw new Error('Could not queue the test dare.');
  } catch (error) { alert(error instanceof Error ? error.message : 'Could not queue the test dare.'); }
  finally { button.disabled = false; }
});
$('#veto').addEventListener('click', () => { void fetch('/api/dare/veto', { method: 'POST', credentials: 'include' }); });
$('#skip').addEventListener('click', () => { void fetch('/api/dare/skip', { method: 'POST', credentials: 'include' }); });
$('#pause').addEventListener('click', () => { void fetch('/api/pause', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: !latestState?.paused }) }); });
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'v') { event.preventDefault(); $('#veto').click(); }
  if (key === 's') { event.preventDefault(); $('#skip').click(); }
  if (key === 'p') { event.preventDefault(); $('#pause').click(); }
});
void loadIdentity();
void loadRuntimeState();
connect();
