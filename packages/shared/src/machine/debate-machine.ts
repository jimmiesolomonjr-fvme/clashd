import { setup, assign } from 'xstate';
import type { DebateStatus, RoundPhase, RoundType } from '../types/database';

// --- Context ---

export interface DebateContext {
  debateId: string;
  sideAUserId: string;
  sideBUserId: string;
  currentRound: number;
  totalRounds: number;
  speakingTimeSeconds: number;
  votingTimeSeconds: number;
  roundTypes: RoundType[];
  roundPhase: RoundPhase;
  currentSpeakerId: string | null;
  timerStartedAt: number | null;
  timerDurationSeconds: number;
  reportCount: number;
  reportWindowStart: number | null;
  pauseReason: string | null;
  winnerId: string | null;
}

// --- Events ---

export type DebateEvent =
  | { type: 'START_COUNTDOWN' }
  | { type: 'COUNTDOWN_COMPLETE' }
  | { type: 'START_ROUND' }
  | { type: 'TIMER_EXPIRED' }
  | { type: 'ADVANCE_TURN' }
  | { type: 'START_VOTING' }
  | { type: 'VOTING_COMPLETE' }
  | { type: 'SCORE_REVEALED' }
  | { type: 'NEXT_ROUND' }
  | { type: 'PAUSE'; reason: string }
  | { type: 'RESUME' }
  | { type: 'CANCEL' }
  | { type: 'REPORT' }
  | { type: 'COMPLETE'; winnerId: string | null };

// --- Helpers ---

function buildRoundTypes(totalRounds: number): RoundType[] {
  if (totalRounds === 1) return ['standard'];
  if (totalRounds === 2) return ['opening', 'closing'];
  const rounds: RoundType[] = ['opening'];
  for (let i = 1; i < totalRounds - 1; i++) {
    rounds.push('standard');
  }
  rounds.push('closing');
  return rounds;
}

function getDefaultContext(): DebateContext {
  return {
    debateId: '',
    sideAUserId: '',
    sideBUserId: '',
    currentRound: 0,
    totalRounds: 3,
    speakingTimeSeconds: 120,
    votingTimeSeconds: 10,
    roundTypes: buildRoundTypes(3),
    roundPhase: 'countdown',
    currentSpeakerId: null,
    timerStartedAt: null,
    timerDurationSeconds: 0,
    reportCount: 0,
    reportWindowStart: null,
    pauseReason: null,
    winnerId: null,
  };
}

// --- Machine ---

export const debateMachine = setup({
  types: {
    context: {} as DebateContext,
    events: {} as DebateEvent,
  },
  actions: {
    setSideASpeaker: assign({
      currentSpeakerId: ({ context }) => context.sideAUserId,
      roundPhase: 'side_a_speaking' as RoundPhase,
      timerStartedAt: () => Date.now(),
      timerDurationSeconds: ({ context }) => context.speakingTimeSeconds,
    }),
    setSideBSpeaker: assign({
      currentSpeakerId: ({ context }) => context.sideBUserId,
      roundPhase: 'side_b_speaking' as RoundPhase,
      timerStartedAt: () => Date.now(),
      timerDurationSeconds: ({ context }) => context.speakingTimeSeconds,
    }),
    clearSpeaker: assign({
      currentSpeakerId: null,
    }),
    startVotingPhase: assign({
      roundPhase: 'voting' as RoundPhase,
      currentSpeakerId: null,
      timerStartedAt: () => Date.now(),
      timerDurationSeconds: ({ context }) => context.votingTimeSeconds,
    }),
    setScoreReveal: assign({
      roundPhase: 'score_reveal' as RoundPhase,
      timerStartedAt: null,
      timerDurationSeconds: 0,
    }),
    advanceRound: assign({
      currentRound: ({ context }) => context.currentRound + 1,
      roundPhase: 'countdown' as RoundPhase,
      currentSpeakerId: null,
      timerStartedAt: null,
      timerDurationSeconds: 0,
    }),
    initRound: assign({
      roundPhase: 'countdown' as RoundPhase,
      timerStartedAt: () => Date.now(),
      timerDurationSeconds: 3, // 3 second countdown between rounds
    }),
    setPaused: assign({
      pauseReason: ({ event }) => {
        if (event.type === 'PAUSE') {
          return (event as { type: 'PAUSE'; reason: string }).reason;
        }
        // Auto-pause triggered by REPORT threshold
        return 'auto_moderation';
      },
      timerStartedAt: null,
    }),
    clearPause: assign({
      pauseReason: null,
    }),
    incrementReport: assign({
      reportCount: ({ context }) => {
        const now = Date.now();
        const windowStart = context.reportWindowStart;
        // Reset count if outside 60s window
        if (!windowStart || now - windowStart > 60_000) {
          return 1;
        }
        return context.reportCount + 1;
      },
      reportWindowStart: ({ context }) => {
        const now = Date.now();
        if (!context.reportWindowStart || now - context.reportWindowStart > 60_000) {
          return now;
        }
        return context.reportWindowStart;
      },
    }),
    setWinner: assign({
      winnerId: ({ event }) => {
        if (event.type === 'COMPLETE') {
          return (event as { type: 'COMPLETE'; winnerId: string | null }).winnerId;
        }
        // When entering completed via NEXT_ROUND (no more rounds), winner is determined later
        return null;
      },
    }),
  },
  guards: {
    hasMoreRounds: ({ context }) => context.currentRound < context.totalRounds - 1,
    noMoreRounds: ({ context }) => context.currentRound >= context.totalRounds - 1,
    // Guard runs before incrementReport action, so count is still pre-increment.
    // To trigger on the 3rd report, check >= 2 (will become 3 after action).
    shouldAutoPause: ({ context }) => context.reportCount >= 2,
  },
}).createMachine({
  id: 'debate',
  initial: 'waitingRoom',
  context: getDefaultContext(),
  states: {
    waitingRoom: {
      on: {
        START_COUNTDOWN: { target: 'countdown' },
        CANCEL: { target: 'cancelled' },
      },
    },

    countdown: {
      entry: 'initRound',
      on: {
        COUNTDOWN_COMPLETE: { target: 'sideASpeaking' },
        CANCEL: { target: 'cancelled' },
      },
    },

    sideASpeaking: {
      entry: 'setSideASpeaker',
      on: {
        TIMER_EXPIRED: { target: 'sideATransition' },
        PAUSE: { target: 'paused', actions: 'setPaused' },
        REPORT: [
          {
            guard: 'shouldAutoPause',
            target: 'paused',
            actions: ['incrementReport', 'setPaused'],
          },
          { actions: 'incrementReport' },
        ],
        CANCEL: { target: 'cancelled' },
      },
    },

    sideATransition: {
      entry: 'clearSpeaker',
      on: {
        ADVANCE_TURN: { target: 'sideBSpeaking' },
      },
    },

    sideBSpeaking: {
      entry: 'setSideBSpeaker',
      on: {
        TIMER_EXPIRED: { target: 'sideBTransition' },
        PAUSE: { target: 'paused', actions: 'setPaused' },
        REPORT: [
          {
            guard: 'shouldAutoPause',
            target: 'paused',
            actions: ['incrementReport', 'setPaused'],
          },
          { actions: 'incrementReport' },
        ],
        CANCEL: { target: 'cancelled' },
      },
    },

    sideBTransition: {
      entry: 'clearSpeaker',
      on: {
        START_VOTING: { target: 'voting' },
      },
    },

    voting: {
      entry: 'startVotingPhase',
      on: {
        VOTING_COMPLETE: { target: 'scoreReveal' },
        CANCEL: { target: 'cancelled' },
      },
    },

    scoreReveal: {
      entry: 'setScoreReveal',
      on: {
        NEXT_ROUND: [
          {
            guard: 'hasMoreRounds',
            target: 'countdown',
            actions: 'advanceRound',
          },
          {
            guard: 'noMoreRounds',
            target: 'completed',
          },
        ],
        CANCEL: { target: 'cancelled' },
      },
    },

    paused: {
      on: {
        RESUME: {
          target: 'sideASpeaking', // simplified — real impl would return to previous state
          actions: 'clearPause',
        },
        CANCEL: { target: 'cancelled' },
      },
    },

    completed: {
      type: 'final',
      entry: 'setWinner',
    },

    cancelled: {
      type: 'final',
    },
  },
});

export { buildRoundTypes, getDefaultContext };
