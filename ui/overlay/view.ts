export interface OverlayState {
  current: null | { id: number; title: string; viewerLogin: string; status: string; bountyBits: number; bountyPoints: number; deadlineAt: number | null; appealCount: number; appealThreshold: number; appealRemainingMs: number; pollRemainingMs: number };
  status: string;
  remainingMs: number;
  latestTick: null | { progress: number; confidence: number; evidence: string };
  queue: Array<{ id: number; title: string; viewerLogin: string }>;
  passRate: number;
  lastClipUrl: string | null;
}

export function remainingMs(deadlineAt: number | null | undefined, now: number): number {
  return deadlineAt == null ? 0 : Math.max(0, deadlineAt - now);
}

export type OverlayView = { mode: 'idle' | 'queued' | 'active' | 'verdict' | 'appeal' | 'poll'; label: string; title: string; viewer: string; seconds: number; remainingMs: number; confidence: number; evidence: string; clipUrl: string | null; appeals: string };

export function stateToView(state: OverlayState, now: number): OverlayView {
  const current = state.current;
  if (!current) return { mode: state.queue.length ? 'queued' : 'idle', label: state.queue.length ? 'DARE QUEUED' : `Dare me: 1000 pts • pass rate ${Math.round(state.passRate * 100)}%`, title: state.queue[0]?.title ?? '', viewer: state.queue[0]?.viewerLogin ?? '', seconds: 0, remainingMs: 0, confidence: 0, evidence: '', clipUrl: state.lastClipUrl, appeals: '' };
  const status = current.status;
  const mode = status === 'POLL' ? 'poll' : status === 'FAIL' || status === 'PASS' || status.startsWith('FINAL_') ? 'verdict' : status === 'APPEAL' ? 'appeal' : 'active';
  const ms = mode === 'appeal' ? current.appealRemainingMs : mode === 'poll' ? current.pollRemainingMs : remainingMs(current.deadlineAt, now);
  return { mode, label: status.startsWith('FINAL_') ? status.slice(6) : status, title: current.title, viewer: current.viewerLogin, seconds: Math.ceil(ms / 1000), remainingMs: ms, confidence: state.latestTick?.confidence ?? 0, evidence: state.latestTick?.evidence ?? '', clipUrl: state.lastClipUrl, appeals: `${current.appealCount}/${current.appealThreshold}` };
}
