export interface OverlayState {
  current: null | { id: number; title: string; viewerLogin: string; status: string; bountyBits: number; bountyPoints: number; deadlineAt: number | null; appealCount: number; appealThreshold: number; appealRemainingMs: number; pollRemainingMs: number };
  status: string;
  remainingMs: number;
  latestTick: null | { progress: number; confidence: number; evidence: string };
  queue: Array<{ id: number; title: string; viewerLogin: string }>;
  passRate: number;
  lastClipUrl: string | null;
  leaderboard?: Array<{ viewer_login: string; dare_count: number; bits: number; points?: number }>;
}

export function remainingMs(deadlineAt: number | null | undefined, now: number): number {
  return deadlineAt == null ? 0 : Math.max(0, deadlineAt - now);
}

export type OverlayView = { mode: 'idle' | 'queued' | 'active' | 'verdict' | 'appeal' | 'poll'; label: string; title: string; viewer: string; dareId: number | null; bounty: string; seconds: number; remainingMs: number; confidence: number; evidence: string; clipUrl: string | null; appeals: string; passRate: number; dareCount: number; queue: Array<{ viewerLogin: string; bounty: string; title: string }>; finalPass: boolean };

export function stateToView(state: OverlayState, now: number): OverlayView {
  const current = state.current;
  const queue = state.queue.slice(0, 3).map((item) => ({ viewerLogin: item.viewerLogin, bounty: 'bountyBits' in item && item.bountyBits ? `${item.bountyBits} BITS` : 'bountyPoints' in item && item.bountyPoints ? `${item.bountyPoints} PTS` : 'NEXT', title: item.title }));
  const dareCount = state.leaderboard?.reduce((sum, row) => sum + row.dare_count, 0) ?? 0;
  if (!current) return { mode: state.queue.length ? 'queued' : 'idle', label: state.queue.length ? 'DARE QUEUED' : 'DARE ME · 1000 PTS', title: state.queue[0]?.title ?? '', viewer: state.queue[0]?.viewerLogin ?? '', dareId: state.queue[0]?.id ?? null, bounty: '', seconds: 0, remainingMs: 0, confidence: 0, evidence: '', clipUrl: state.lastClipUrl, appeals: '', passRate: state.passRate, dareCount, queue, finalPass: false };
  const status = current.status;
  const mode = status === 'POLL' ? 'poll' : status === 'FAIL' || status === 'APPEAL' ? 'appeal' : status === 'PASS' || status.startsWith('FINAL_') ? 'verdict' : 'active';
  const ms = mode === 'appeal' ? current.appealRemainingMs : mode === 'poll' ? current.pollRemainingMs : remainingMs(current.deadlineAt, now);
  const label = mode === 'appeal' || mode === 'poll' ? 'FAIL' : status.startsWith('FINAL_') ? status.slice(6) : status;
  return { mode, label, title: current.title, viewer: current.viewerLogin, dareId: current.id, bounty: current.bountyBits ? `${current.bountyBits} BITS` : `${current.bountyPoints} PTS`, seconds: Math.ceil(ms / 1000), remainingMs: ms, confidence: state.latestTick?.confidence ?? 0, evidence: state.latestTick?.evidence ?? '', clipUrl: state.lastClipUrl, appeals: `${current.appealCount}/${current.appealThreshold}`, passRate: state.passRate, dareCount, queue, finalPass: status === 'FINAL_PASS' };
}
