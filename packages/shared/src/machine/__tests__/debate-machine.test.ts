import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { debateMachine, getDefaultContext } from '../debate-machine';

function createTestActor(overrides: Partial<ReturnType<typeof getDefaultContext>> = {}) {
  return createActor(
    debateMachine.provide({
      // Use test-friendly context
    }),
    {
      input: undefined,
      snapshot: debateMachine.resolveState({
        value: 'waitingRoom',
        context: {
          ...getDefaultContext(),
          debateId: 'test-debate-1',
          sideAUserId: 'user-a',
          sideBUserId: 'user-b',
          totalRounds: 3,
          speakingTimeSeconds: 120,
          votingTimeSeconds: 10,
          ...overrides,
        },
      }),
    },
  );
}

describe('debateMachine', () => {
  it('starts in waitingRoom', () => {
    const actor = createTestActor();
    actor.start();
    expect(actor.getSnapshot().value).toBe('waitingRoom');
    actor.stop();
  });

  it('transitions from waitingRoom to countdown on START_COUNTDOWN', () => {
    const actor = createTestActor();
    actor.start();
    actor.send({ type: 'START_COUNTDOWN' });
    expect(actor.getSnapshot().value).toBe('countdown');
    actor.stop();
  });

  it('flows through a complete speaking turn: countdown → sideA → transition → sideB → transition → voting', () => {
    const actor = createTestActor();
    actor.start();

    actor.send({ type: 'START_COUNTDOWN' });
    expect(actor.getSnapshot().value).toBe('countdown');

    actor.send({ type: 'COUNTDOWN_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('sideASpeaking');
    expect(actor.getSnapshot().context.currentSpeakerId).toBe('user-a');

    actor.send({ type: 'TIMER_EXPIRED' });
    expect(actor.getSnapshot().value).toBe('sideATransition');
    expect(actor.getSnapshot().context.currentSpeakerId).toBeNull();

    actor.send({ type: 'ADVANCE_TURN' });
    expect(actor.getSnapshot().value).toBe('sideBSpeaking');
    expect(actor.getSnapshot().context.currentSpeakerId).toBe('user-b');

    actor.send({ type: 'TIMER_EXPIRED' });
    expect(actor.getSnapshot().value).toBe('sideBTransition');

    actor.send({ type: 'START_VOTING' });
    expect(actor.getSnapshot().value).toBe('voting');

    actor.stop();
  });

  it('transitions through voting to score reveal', () => {
    const actor = createTestActor();
    actor.start();

    // Fast-forward to voting
    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({ type: 'COUNTDOWN_COMPLETE' });
    actor.send({ type: 'TIMER_EXPIRED' });
    actor.send({ type: 'ADVANCE_TURN' });
    actor.send({ type: 'TIMER_EXPIRED' });
    actor.send({ type: 'START_VOTING' });
    actor.send({ type: 'VOTING_COMPLETE' });

    expect(actor.getSnapshot().value).toBe('scoreReveal');
    actor.stop();
  });

  it('advances to next round when there are more rounds', () => {
    const actor = createTestActor({ totalRounds: 3, currentRound: 0 });
    actor.start();

    // Complete round 1
    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({ type: 'COUNTDOWN_COMPLETE' });
    actor.send({ type: 'TIMER_EXPIRED' });
    actor.send({ type: 'ADVANCE_TURN' });
    actor.send({ type: 'TIMER_EXPIRED' });
    actor.send({ type: 'START_VOTING' });
    actor.send({ type: 'VOTING_COMPLETE' });
    actor.send({ type: 'NEXT_ROUND' });

    expect(actor.getSnapshot().value).toBe('countdown');
    expect(actor.getSnapshot().context.currentRound).toBe(1);
    actor.stop();
  });

  it('completes debate after final round', () => {
    const actor = createTestActor({ totalRounds: 1, currentRound: 0 });
    actor.start();

    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({ type: 'COUNTDOWN_COMPLETE' });
    actor.send({ type: 'TIMER_EXPIRED' });
    actor.send({ type: 'ADVANCE_TURN' });
    actor.send({ type: 'TIMER_EXPIRED' });
    actor.send({ type: 'START_VOTING' });
    actor.send({ type: 'VOTING_COMPLETE' });
    actor.send({ type: 'NEXT_ROUND' });

    expect(actor.getSnapshot().value).toBe('completed');
    expect(actor.getSnapshot().status).toBe('done');
    actor.stop();
  });

  it('pauses on PAUSE event', () => {
    const actor = createTestActor();
    actor.start();

    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({ type: 'COUNTDOWN_COMPLETE' });
    // Now in sideASpeaking
    actor.send({ type: 'PAUSE', reason: 'moderation' });

    expect(actor.getSnapshot().value).toBe('paused');
    expect(actor.getSnapshot().context.pauseReason).toBe('moderation');
    actor.stop();
  });

  it('resumes from paused state', () => {
    const actor = createTestActor();
    actor.start();

    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({ type: 'COUNTDOWN_COMPLETE' });
    actor.send({ type: 'PAUSE', reason: 'moderation' });
    actor.send({ type: 'RESUME' });

    expect(actor.getSnapshot().value).toBe('sideASpeaking');
    expect(actor.getSnapshot().context.pauseReason).toBeNull();
    actor.stop();
  });

  it('can be cancelled from any state', () => {
    const actor = createTestActor();
    actor.start();

    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('cancelled');
    expect(actor.getSnapshot().status).toBe('done');
    actor.stop();
  });

  it('tracks reports and auto-pauses at threshold', () => {
    const actor = createTestActor();
    actor.start();

    actor.send({ type: 'START_COUNTDOWN' });
    actor.send({ type: 'COUNTDOWN_COMPLETE' });
    // In sideASpeaking — send reports
    actor.send({ type: 'REPORT' });
    expect(actor.getSnapshot().context.reportCount).toBe(1);
    actor.send({ type: 'REPORT' });
    expect(actor.getSnapshot().context.reportCount).toBe(2);
    // Third report should trigger auto-pause
    actor.send({ type: 'REPORT' });
    expect(actor.getSnapshot().value).toBe('paused');

    actor.stop();
  });
});
