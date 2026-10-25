import { stateToView, type OverlayState, type OverlayView } from './view.js';
import type { OverlayQuery } from './query.js';

export class OverlayRenderer {
  private readonly root: HTMLElement;
  private previousEvidence = '';
  private evidenceHistory: string[] = [];
  private evidenceChangedAt = 0;
  private stampKey = '';
  private stampAt = 0;
  private lastSoundKey = '';
  private lastTickSecond = -1;
  private audio: AudioContext | null = null;
  private jitter = 0;
  private lastMarkupKey = '';

  constructor(root: HTMLElement, private readonly query: OverlayQuery) {
    this.root = root;
    if (query.position !== 'bl') root.dataset.position = query.position;
    this.root.style.setProperty('--overlay-scale', String(query.scale));
    if (query.hideIdle) this.root.classList.add('hide-idle');
    if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      window.setInterval(() => { this.jitter = (Math.random() * 4 - 2); }, 300);
    }
  }

  render(state: OverlayState, now: number, connected: boolean, receivedAt: number): void {
    const view = stateToView(state, now);
    if (view.evidence !== this.previousEvidence) {
      if (this.previousEvidence) this.evidenceHistory = [this.previousEvidence, ...this.evidenceHistory].slice(0, 2);
      this.previousEvidence = view.evidence;
      this.evidenceChangedAt = now;
    }
    const verdict = view.mode === 'verdict' || view.mode === 'appeal' || view.mode === 'poll';
    const key = verdict ? `${view.dareId}:${view.label}` : '';
    if (key && key !== this.stampKey) { this.stampKey = key; this.stampAt = now; }
    if (!key) { this.stampKey = ''; this.stampAt = 0; }
    const age = Math.max(0, now - receivedAt);
    const seconds = Math.max(0, view.remainingMs - (view.mode === 'active' ? 0 : age)) / 1000;
    const elapsedStamp = this.stampAt ? now - this.stampAt : 0;
    const clipVisible = verdict && elapsedStamp >= 4000 && view.label.includes('PASS') && !!view.clipUrl;
    const active = view.mode === 'active';
    const confidence = Math.max(0, Math.min(100, Math.round(view.confidence * 100 + (active ? this.jitter : 0))));
    const displayEvidence = view.evidence.slice(0, Math.max(0, Math.floor((now - this.evidenceChangedAt) / 20)));
    const isPass = view.label.includes('PASS');
    const bounty = view.bounty || '1000 PTS';
    const ringColor = seconds < 10 ? 'var(--fail)' : seconds < 30 ? 'var(--amber)' : 'var(--volt)';
    const ringProgress = active
      ? Math.min(1, Math.max(0, seconds / view.durationSec))
      : 0;
    const queue = view.queue.map((item) => `<span class="queue-pill"><b>NEXT</b> · @${escape(item.viewerLogin)} · ${escape(item.bounty)}</span>`).join('');
    const evidenceHistory = this.evidenceHistory.map((line) => `<div class="prior-evidence">${escape(line)}</div>`).join('');
    const statusBar = view.mode === 'appeal'
      ? `<div class="state-bar appeal"><strong>TYPE !APPEAL TO OVERRULE</strong><span class="bar-timer">${escape(view.appeals)} · ${seconds.toFixed(1)}s</span><i style="transform:scaleX(${Math.max(0, Math.min(1, seconds / 30))})"></i></div>`
      : view.mode === 'poll'
        ? `<div class="state-bar poll"><strong>CHAT IS VOTING · OVERRULE THE REF?</strong><span class="bar-timer">${seconds.toFixed(1)}s</span><i style="transform:scaleX(${Math.max(0, Math.min(1, seconds / 60))})"></i></div>` : '';
    const stamp = verdict ? `<div class="stamp-wrap ${isPass ? 'is-pass' : 'is-fail'}"><div class="stamp ${view.finalPass ? 'overruled' : ''}">${view.finalPass ? 'OVERRULED → PROVED IT' : isPass ? 'PROVED IT' : 'FAILED'}</div></div>${clipVisible ? `<a class="receipt" href="${escape(view.clipUrl!)}" target="_blank" rel="noreferrer">📎 CLIP SAVED · ${escape(truncateMiddle(view.clipUrl!, 56))}</a>` : ''}` : '';
    const idle = view.mode === 'idle' ? `<div class="idle-pill"><span class="live-dot"></span><strong>DARE ME · 1000 PTS</strong><span class="idle-stats">PASS RATE ${Math.round(view.passRate * 100)}% · ${view.dareCount} DARES</span></div>` : '';
    const incoming = view.mode === 'queued' ? `<div class="incoming-pill">🎯 DARE QUEUED <span>@${escape(view.viewer)}</span> · ${escape(view.title)}</div>` : '';
    this.root.dataset.mode = view.mode;
    this.root.classList.toggle('shake', verdict && elapsedStamp < 250);
    const markupKey = JSON.stringify([view.mode, view.dareId, view.label, view.title, view.viewer, view.bounty, view.evidence, queue, view.appeals, view.clipUrl, clipVisible, idle, incoming, connected, view.passRate, view.dareCount, view.finalPass]);
    if (markupKey !== this.lastMarkupKey) {
    this.lastMarkupKey = markupKey;
    this.root.innerHTML = `<div class="reconnect ${connected ? '' : 'down'}"><i></i>${connected ? '' : 'RECONNECTING'}</div>${idle}${incoming}${view.mode !== 'idle' && view.mode !== 'queued' ? `<section class="fight-card ${verdict ? 'has-verdict' : ''}">
      <header class="card-head"><div><span class="eyebrow">DARE #${view.dareId ?? '—'}</span><strong class="viewer">@${escape(view.viewer)}</strong></div><span class="bounty ${state.current?.bountyBits ? 'bits' : 'points'}">${escape(bounty)}</span></header>
      <div class="main-row"><div class="dare-copy"><h1>${escape(view.title)}</h1><div class="telemetry"><span class="small-label">REF SEES ▸</span><div class="evidence-stack">${evidenceHistory}<div class="evidence">${escape(displayEvidence)}<b class="caret">▌</b></div></div></div></div>
        <div class="countdown" style="--ring-color:${ringColor};--ring-progress:${ringProgress * 360}deg"><div class="ring-core"><strong>${Math.max(0, Math.floor(seconds))}</strong><small>.${String(Math.floor((seconds % 1) * 10)).padStart(1, '0')}s</small></div></div>
      </div>
      <div class="meter-block"><div class="meter-label"><span>REF METER</span><strong>REF CONFIDENCE ${confidence}%</strong></div><div class="gauge"><span class="segment nope">NOPE</span><span class="segment maybe">MAYBE</span><span class="segment proved">PROVED</span><i class="needle" style="left:${confidence}%"></i></div></div>
      ${stamp}${statusBar}
      ${queue ? `<footer class="queue-strip">${queue}</footer>` : ''}
    </section>` : ''}`;
    }
    const ring = this.root.querySelector<HTMLElement>('.countdown');
    if (ring) { ring.style.setProperty('--ring-progress', `${ringProgress * 360}deg`); ring.style.setProperty('--ring-color', ringColor); ring.classList.toggle('urgent', active && seconds < 10); const whole = ring.querySelector('strong'); const tenth = ring.querySelector('small'); if (whole) whole.textContent = String(Math.max(0, Math.floor(seconds))); if (tenth) tenth.textContent = `.${String(Math.floor((seconds % 1) * 10)).padStart(1, '0')}s`; }
    const needle = this.root.querySelector<HTMLElement>('.needle'); if (needle) needle.style.left = `${confidence}%`;
    const meterLabel = this.root.querySelector<HTMLElement>('.meter-label strong'); if (meterLabel) meterLabel.textContent = `REF CONFIDENCE ${confidence}%`;
    const barTimer = this.root.querySelector<HTMLElement>('.bar-timer'); if (barTimer) barTimer.textContent = view.mode === 'appeal' ? `${view.appeals} · ${seconds.toFixed(1)}s` : `${seconds.toFixed(1)}s`;
    const bar = this.root.querySelector<HTMLElement>('.state-bar i'); if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, seconds / (view.mode === 'appeal' ? 30 : 60)))})`;
    const evidence = this.root.querySelector<HTMLElement>('.evidence'); if (evidence) { const typed = view.evidence.slice(0, Math.max(0, Math.floor((now - this.evidenceChangedAt) / 20))); evidence.innerHTML = `${escape(typed)}<b class="caret">▌</b>`; }
    this.sound(view, now);
  }

  private sound(view: OverlayView, now: number): void {
    if (!this.query.sfx) return;
    if (!['queued', 'active', 'verdict', 'appeal', 'poll'].includes(view.mode)) return;
    const key = `${view.dareId}:${view.mode === 'verdict' || view.mode === 'appeal' || view.mode === 'poll' ? view.label : view.mode}`;
    if (key === this.lastSoundKey && !(view.mode === 'active' && view.remainingMs < 10_000)) return;
    const newState = key !== this.lastSoundKey;
    this.lastSoundKey = key;
    try {
      const Ctx = window.AudioContext;
      if (!Ctx) return;
      this.audio ??= new Ctx();
      if (this.audio.state === 'suspended') void this.audio.resume().catch(() => undefined);
      const ctx = this.audio;
      const play = (freq: number, start: number, duration: number, type: OscillatorType, gainValue = 0.045): void => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type; oscillator.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(gainValue, start); gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + duration);
      };
      const t = ctx.currentTime;
      if ((view.mode === 'verdict' || view.mode === 'appeal' || view.mode === 'poll') && newState) {
        if (view.label.includes('PASS')) { play(523, t, .25, 'sine'); play(659, t + .13, .28, 'sine'); play(784, t + .26, .38, 'sine'); }
        else { play(175, t, .42, 'sawtooth', .025); }
      } else if (view.mode === 'queued' && newState) {
        play(523, t, .12, 'sine', .035); play(659, t + .09, .13, 'sine', .035); play(784, t + .18, .2, 'sine', .035);
      } else if (view.mode === 'active' && newState) {
        play(660, t, .11, 'sine'); play(880, t + .11, .16, 'sine');
      } else if (view.mode === 'active' && view.remainingMs < 10_000) {
        const second = Math.floor(view.remainingMs / 1000);
        if (second !== this.lastTickSecond) { this.lastTickSecond = second; play(900, t, .035, 'sine', .012); }
      }
    } catch { /* WebAudio is optional when the host blocks autoplay. */ }
  }
}

function escape(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function truncateMiddle(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, Math.ceil((max - 1) / 2))}…${value.slice(-Math.floor((max - 1) / 2))}`; }
