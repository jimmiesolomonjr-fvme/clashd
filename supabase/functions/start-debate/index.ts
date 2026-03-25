// supabase/functions/start-debate/index.ts
// Transition a debate from waiting_room → countdown → live
// Only the debate creator can start. Both debaters must be present.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COUNTDOWN_SECONDS = 3;

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

    const { debate_id, present_user_ids } = await req.json();

    if (!debate_id) {
      return new Response(
        JSON.stringify({ error: 'debate_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!present_user_ids || !Array.isArray(present_user_ids)) {
      return new Response(
        JSON.stringify({ error: 'present_user_ids must be an array of user IDs currently in the room' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch the debate
    const { data: debate, error: debateError } = await supabaseAdmin
      .from('debates')
      .select('*')
      .eq('id', debate_id)
      .single();

    if (debateError || !debate) {
      return new Response(
        JSON.stringify({ error: 'Debate not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Only the debate creator can start it
    if (debate.created_by !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Only the debate creator can start the debate' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Debate must be in waiting_room status
    if (debate.status !== 'waiting_room') {
      return new Response(
        JSON.stringify({ error: `Cannot start debate in "${debate.status}" status. Must be in "waiting_room".` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validate both debaters are present
    const sideAPresent = present_user_ids.includes(debate.side_a_user_id);
    const sideBPresent = present_user_ids.includes(debate.side_b_user_id);

    if (!sideAPresent || !sideBPresent) {
      const missing: string[] = [];
      if (!sideAPresent) missing.push('Side A');
      if (!sideBPresent) missing.push('Side B');
      return new Response(
        JSON.stringify({
          error: `Both debaters must be present. Missing: ${missing.join(', ')}`,
          missing_sides: missing,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Transition to countdown first
    const { error: countdownError } = await supabaseAdmin
      .from('debates')
      .update({ status: 'countdown' })
      .eq('id', debate_id)
      .eq('status', 'waiting_room'); // Optimistic lock on status

    if (countdownError) {
      return new Response(
        JSON.stringify({ error: 'Failed to transition to countdown', details: countdownError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Set the first round's timer for the countdown phase
    const { error: roundError } = await supabaseAdmin
      .from('rounds')
      .update({
        phase: 'countdown',
        timer_started_at: new Date().toISOString(),
        timer_duration_seconds: COUNTDOWN_SECONDS,
      })
      .eq('debate_id', debate_id)
      .eq('round_number', 1);

    if (roundError) {
      console.error('Failed to update first round timer:', roundError);
    }

    // After the countdown period, transition to live
    // In production this would be handled by a scheduled job or the client
    // calling advance-round after the countdown. For now, we set it to live
    // with started_at and let the client manage the countdown display.
    const now = new Date().toISOString();
    const { data: updatedDebate, error: liveError } = await supabaseAdmin
      .from('debates')
      .update({
        status: 'live',
        started_at: now,
      })
      .eq('id', debate_id)
      .select()
      .single();

    if (liveError) {
      return new Response(
        JSON.stringify({ error: 'Failed to transition to live', details: liveError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        debate: updatedDebate,
        countdown_seconds: COUNTDOWN_SECONDS,
        message: 'Debate started successfully',
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
