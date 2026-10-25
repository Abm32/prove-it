import type { Dare, DareMachine, RefereeOptions, Tick } from './types.js';

const defaults: Required<RefereeOptions> = {
  durationSec: 120,
  passConfidence: 0.8,
  appealWindowSec: 30,
  appealThreshold: 3,
};

function illegal(action: string, state: DareMachine): never {
  throw new Error(`Illegal ${action} transition from ${state.status}`);
}

function finish(state: DareMachine, verdict: 'PASS' | 'FAIL', at: number): DareMachine {
  return { ...state, status: verdict, verdict, decidedAt: at };
}

export function createDareMachine(dare: Dare, opts: RefereeOptions = {}): DareMachine {
  const options = { ...defaults, durationSec: dare.durationSec, ...opts };
  if (!Number.isFinite(options.durationSec) || options.durationSec <= 0) throw new Error('durationSec must be positive');
  if (options.passConfidence < 0 || options.passConfidence > 1) throw new Error('passConfidence must be between 0 and 1');
  if (!Number.isInteger(options.appealThreshold) || options.appealThreshold < 1) throw new Error('appealThreshold must be a positive integer');
  if (!Number.isFinite(options.appealWindowSec) || options.appealWindowSec < 0) throw new Error('appealWindowSec must be non-negative');
  return {
    dare,
    status: 'QUEUED',
    options,
    startedAt: null,
    deadlineAt: null,
    decidedAt: null,
    verdict: null,
    history: [],
    appeals: [],
    pollResolvedAt: null,
  };
}

export function start(state: DareMachine, now: number): DareMachine {
  if (state.status !== 'QUEUED') return illegal('start', state);
  return {
    ...state,
    status: 'ACTIVE',
    startedAt: now,
    deadlineAt: now + state.options.durationSec * 1000,
  };
}

export function tick(state: DareMachine, value: Tick): DareMachine {
  if (state.status !== 'ACTIVE' && state.status !== 'JUDGING') return illegal('tick', state);
  if (state.deadlineAt !== null && value.at >= state.deadlineAt) return finish(state, 'FAIL', state.deadlineAt);
  const history = [...state.history, value];
  const lastTwo = history.slice(-2);
  const passed = lastTwo.length === 2 && lastTwo.every((item) => item.done && item.confidence >= state.options.passConfidence);
  if (passed) return { ...state, history, status: 'PASS', verdict: 'PASS', decidedAt: value.at };
  const qualifyingLatest = value.done && value.confidence >= state.options.passConfidence;
  return { ...state, history, status: qualifyingLatest ? 'JUDGING' : 'ACTIVE' };
}

export function advance(state: DareMachine, now: number): DareMachine {
  if ((state.status === 'ACTIVE' || state.status === 'JUDGING') && state.deadlineAt !== null && now >= state.deadlineAt) {
    return finish(state, 'FAIL', state.deadlineAt);
  }
  if ((state.status === 'PASS' || state.status === 'FAIL' || state.status === 'APPEAL') && state.decidedAt !== null) {
    const appealEndsAt = state.decidedAt + state.options.appealWindowSec * 1000;
    if (now >= appealEndsAt) {
      return { ...state, status: state.verdict === 'PASS' ? 'FINAL_PASS' : 'FINAL_FAIL' };
    }
  }
  return state;
}

export function veto(state: DareMachine): DareMachine {
  if (state.status !== 'QUEUED' && state.status !== 'ACTIVE' && state.status !== 'JUDGING') return illegal('veto', state);
  return { ...state, status: 'VETOED' };
}

export function appeal(state: DareMachine, viewerId: string, now: number): DareMachine {
  if ((state.status !== 'FAIL' && state.status !== 'APPEAL') || state.decidedAt === null) return illegal('appeal', state);
  if (now > state.decidedAt + state.options.appealWindowSec * 1000) return illegal('appeal', state);
  const appeals = state.appeals.some((entry) => entry.viewerId === viewerId)
    ? state.appeals
    : [...state.appeals, { viewerId, at: now }];
  return {
    ...state,
    appeals,
    status: appeals.length >= state.options.appealThreshold ? 'POLL' : 'APPEAL',
  };
}

export function resolvePoll(state: DareMachine, majorityOverrule: boolean, now: number): DareMachine {
  if (state.status !== 'POLL') return illegal('resolve poll', state);
  const verdict = majorityOverrule ? 'PASS' : 'FAIL';
  return {
    ...state,
    status: majorityOverrule ? 'FINAL_PASS' : 'FINAL_FAIL',
    verdict,
    decidedAt: now,
    pollResolvedAt: now,
  };
}
