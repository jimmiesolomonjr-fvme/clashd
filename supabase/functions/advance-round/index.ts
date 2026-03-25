// supabase/functions/advance-round/index.ts
// Authoritative round/turn advancement with server-side timer validation.
// Phase progression: side_a_speaking → side_a_transition → side_b_speaking → side_b_transition → voting
// Idempotent: multiple calls for the same transition are safe.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Phase transition map: current phase → next phase
const PHASE_TRANSITIONS: Record<string, string> = {
  'countdown': 'side_a_speaking',
  'side_a_speaking': 'side_a_transition',
  'side_a_transition': 'side_b_speaking',
  'side_b_speaking': 'side_b_transition',
  'side_b_transition': 'voting',
  'voting': 'score_reveal',
  'score_reveal': 'completed',
};

// Phases that require timer validation (timed phases)
const TIMED_PHASES = new Set([
  'countdown',
  'side_a_speaking',
  'side_b_speaking',
  'voting',
]);

// Transition phases (brief pauses, no strict timer enforcement)
const TRANSITION_PHASES = new Set([
  'side_a_transition',
  'side_b_transition',
  'score_reveal',
]);

// Grace period in seconds for timer checks (allow slight client/server clock differences)
const TIMER_GRACE_SECONDS = 2;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { debate_id, round_id, expected_phase } = await req.json();

    if (!debate_id || !round_id) {
      return new Response(
        JSON.stringify({ error: 'debate_id and round_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch debate and round
    const [debateResult, roundResult] = await Promise.all([
      supabaseAdmin.from('debates').select('*').eq('id', debate_id).single(),
      supabaseAdmin.from('rounds').select('*').eq('id', round_id).eq('debate_id', debate_id).single(),
    ]);

    if (debateResult.error || !debateResult.data) {
      return new Response(
        JSON.stringify({ error: 'Debate not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (roundResult.error || !roundResult.data) {
      return new Response(
        JSON.stringify({ error: 'Round not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const debate = debateResult.data;
    const round = roundResult.data;

    // Only allow advancement for live debates
    if (debate.status !== 'live') {
      return new Response(
        JSON.stringify({ error: `Debate is not live (current status: ${debate.status})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Only debate participants or creator can advance
    const isParticipant = [debate.side_a_user_id, debate.side_b_user_id, debate.created_by].includes(user.id);
    if (!isParticipant) {
      return new Response(
        JSON.stringify({ error: 'Only debate participants can advance rounds' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const currentPhase = round.phase;
    const nextPhase = PHASE_TRANSITIONS[currentPhase];

    if (!nextPhase) {
      return new Response(
        JSON.stringify({ error: `Cannot advance from phase: ${currentPhase}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Idempotency check: if expected_phase was provided and doesn't match, the
    // transition already happened — return success.
    if (expected_phase && expected_phase !== currentPhase) {
      return new Response(
        JSON.stringify({
          message: 'Phase already advanced (idempotent)',
          round_id: round.id,
          current_phase: currentPhase,
          requested_from_phase: expected_phase,
          already_advanced: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Server-side timer validation for timed phases
    if (TIMED_PHASES.has(currentPhase) && round.timer_started_at) {
      const timerStarted = new Date(round.timer_started_at).getTime();
      const timerDuration = round.timer_duration_seconds * 1000;
      const now = Date.now();
      const elapsed = now - timerStarted;
      const remaining = timerDuration - elapsed;

      // Allow advancement only if timer has expired (with grace period)
      if (remaining > TIMER_GRACE_SECONDS * 1000) {
        return new Response(
          JSON.stringify({
            error: 'Timer has not expired yet',
            remaining_seconds: Math.ceil(remaining / 1000),
            timer_started_at: round.timer_started_at,
            timer_duration_seconds: round.timer_duration_seconds,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Build the update payload for the round
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      phase: nextPhase,
    };

    // Set speaker and timer based on the next phase
    if (nextPhase === 'side_a_speaking') {
      updatePayload.current_speaker_id = debate.side_a_user_id;
      updatePayload.timer_started_at = now;
      updatePayload.timer_duration_seconds = debate.speaking_time_seconds;
    } else if (nextPhase === 'side_b_speaking') {
      updatePayload.current_speaker_id = debate.side_b_user_id;
      updatePayload.timer_started_at = now;
      updatePayload.timer_duration_seconds = debate.speaking_time_seconds;
    } else if (nextPhase === 'voting') {
      updatePayload.current_speaker_id = null;
      updatePayload.timer_started_at = now;
      updatePayload.timer_duration_seconds = debate.voting_time_seconds;
    } else if (nextPhase === 'side_a_transition' || nextPhase === 'side_b_transition') {
      updatePayload.current_speaker_id = null;
      updatePayload.timer_started_at = null;
      updatePayload.timer_duration_seconds = 0;
    } else if (nextPhase === 'score_reveal') {
      updatePayload.current_speaker_id = null;
      updatePayload.timer_started_at = null;
      updatePayload.timer_duration_seconds = 0;
    } else if (nextPhase === 'completed') {
      updatePayload.current_speaker_id = null;
      updatePayload.timer_started_at = null;
      updatePayload.timer_duration_seconds = 0;
    }

    // Optimistic concurrency: only update if still in the expected phase
    const { data: updatedRound, error: updateError } = await supabaseAdmin
      .from('rounds')
      .update(updatePayload)
      .eq('id', round_id)
      .eq('phase', currentPhase) // Optimistic lock
      .select()
      .single();

    if (updateError) {
      // If no rows updated, another caller already advanced — idempotent success
      if (updateError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({
            message: 'Phase already advanced by another caller (idempotent)',
            round_id: round.id,
            already_advanced: true,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to advance round', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // If no rows were returned, the phase was already advanced
    if (!updatedRound) {
      return new Response(
        JSON.stringify({
          message: 'Phase already advanced (idempotent)',
          round_id: round.id,
          already_advanced: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build MUTE_CONTROL broadcast messages
    const muteMessages: Array<{ target_user_id: string; muted: boolean; reason: string }> = [];

    if (nextPhase === 'side_a_speaking') {
      // Unmute side A, mute side B
      muteMessages.push(
        { target_user_id: debate.side_a_user_id, muted: false, reason: 'turn_ended' },
        { target_user_id: debate.side_b_user_id, muted: true, reason: 'turn_ended' },
      );
    } else if (nextPhase === 'side_b_speaking') {
      // Mute side A, unmute side B
      muteMessages.push(
        { target_user_id: debate.side_a_user_id, muted: true, reason: 'turn_ended' },
        { target_user_id: debate.side_b_user_id, muted: false, reason: 'turn_ended' },
      );
    } else if (nextPhase === 'side_a_transition' || nextPhase === 'side_b_transition' || nextPhase === 'voting') {
      // Mute both during transitions and voting
      muteMessages.push(
        { target_user_id: debate.side_a_user_id, muted: true, reason: 'turn_ended' },
        { target_user_id: debate.side_b_user_id, muted: true, reason: 'turn_ended' },
      );
    }

    // Broadcast mute control messages via Supabase Realtime
    const channelName = `debate:${debate_id}`;
    for (const msg of muteMessages) {
      // Use the Supabase Realtime broadcast via REST API
      // The client listens on the broadcast channel for these messages
      await supabaseAdmin.channel(channelName).send({
        type: 'broadcast',
        event: 'mute_control',
        payload: {
          type: 'mute_control',
          target_user_id: msg.target_user_id,
          muted: msg.muted,
          reason: msg.reason,
        },
      });
    }

    // Also broadcast a timer sync message
    if (updatedRound.timer_started_at && updatedRound.timer_duration_seconds > 0) {
      await supabaseAdmin.channel(channelName).send({
        type: 'broadcast',
        event: 'timer_sync',
        payload: {
          type: 'timer_sync',
          round_id: updatedRound.id,
          phase: updatedRound.phase,
          remaining_seconds: updatedRound.timer_duration_seconds,
          server_timestamp: Date.now(),
        },
      });
    }

    return new Response(
      JSON.stringify({
        round: updatedRound,
        previous_phase: currentPhase,
        new_phase: nextPhase,
        mute_messages: muteMessages,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
