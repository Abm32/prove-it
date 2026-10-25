export type DareKind = 'visual' | 'audio' | 'count' | 'timed';
export type Verdict = 'PASS' | 'FAIL';
export type DareStatus =
  | 'QUEUED'
  | 'ACTIVE'
  | 'JUDGING'
  | 'PASS'
  | 'FAIL'
  | 'APPEAL'
  | 'POLL'
  | 'FINAL_PASS'
  | 'FINAL_FAIL'
  | 'REJECTED'
  | 'VETOED';

export interface SuccessCondition {
  type: DareKind;
  condition: string;
  count_target: number | null;
}

export interface Dare {
  id: number;
  channelId: string;
  viewerId: string;
  viewerLogin: string;
  viewerName: string;
  text: string;
  kind: DareKind;
  condition: SuccessCondition;
  bountyPoints: number;
  bountyBits: number;
  createdAt: number;
  durationSec: number;
}

export interface Tick {
  progress: number;
  evidence: string;
  done: boolean;
  confidence: number;
  at: number;
}

export interface RefereeOptions {
  durationSec?: number;
  passConfidence?: number;
  appealWindowSec?: number;
  appealThreshold?: number;
}

export interface DareMachine {
  dare: Dare;
  status: DareStatus;
  options: Required<RefereeOptions>;
  startedAt: number | null;
  deadlineAt: number | null;
  decidedAt: number | null;
  verdict: Verdict | null;
  history: Tick[];
  appeals: Array<{ viewerId: string; at: number }>;
  pollResolvedAt: number | null;
}
