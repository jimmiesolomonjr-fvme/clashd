// supabase/functions/respond-challenge/index.ts
// Accept or decline a challenge. On accept, creates a debate in waiting_room status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default format for challenge-created debates
const DEFAULT_FORMAT = {
  format: 'classic' as const,
  round_count: 3,
  speaking_time_seconds: 120,
  voting_time_seconds: 10,
};

function buildRoundTypes(totalRounds: number): string[] {
  if (totalRounds === 1) return ['standard'];
  if (totalRounds === 2) return ['opening', 'closing'];
  const rounds: string[] = ['opening'];
  for (let i = 1; i < totalRounds - 1; i++) {
    rounds.push('standard');
  }
  rounds.push('closing');
  return rounds;
}

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
    const body = await req.json();

    const { challenge_id, action } = body;

    // Validate input
    if (!challenge_id || typeof challenge_id !== 'string' || !uuidRegex.test(challenge_id)) {
      return new Response(
        JSON.stringify({ error: 'challenge_id must be a valid UUID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action !== 'accept' && action !== 'decline') {
      return new Response(
        JSON.stringify({ error: 'action must be "accept" or "decline"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch the challenge
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from('challenges')
      .select('*')
      .eq('id', challenge_id)
      .single();

    if (challengeError || !challenge) {
      return new Response(
        JSON.stringify({ error: 'Challenge not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Only the challenged user can respond
    if (challenge.challenged_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Only the challenged user can respond to this challenge' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Challenge must be pending
    if (challenge.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Challenge is already ${challenge.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if expired
    if (new Date(challenge.expires_at) < new Date()) {
      await supabaseAdmin
        .from('challenges')
        .update({ status: 'expired' })
        .eq('id', challenge_id);

      return new Response(
        JSON.stringify({ error: 'Challenge has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Handle decline
    if (action === 'decline') {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('challenges')
        .update({ status: 'declined' })
        .eq('id', challenge_id)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Failed to decline challenge', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({ challenge: updated, message: 'Challenge declined' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Handle accept — create a debate in waiting_room status
    const { data: debate, error: debateError } = await supabaseAdmin
      .from('debates')
      .insert({
        topic: challenge.topic,
        description: null,
        format: DEFAULT_FORMAT.format,
        status: 'waiting_room',
        side_a_user_id: challenge.challenger_id,
        side_b_user_id: challenge.challenged_id,
        side_a_label: 'For',
        side_b_label: 'Against',
        round_count: DEFAULT_FORMAT.round_count,
        speaking_time_seconds: DEFAULT_FORMAT.speaking_time_seconds,
        voting_time_seconds: DEFAULT_FORMAT.voting_time_seconds,
        is_public: true,
        created_by: challenge.challenger_id,
      })
      .select()
      .single();

    if (debateError || !debate) {
      return new Response(
        JSON.stringify({ error: 'Failed to create debate', details: debateError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Set agora_channel_id
    await supabaseAdmin
      .from('debates')
      .update({ agora_channel_id: debate.id })
      .eq('id', debate.id);

    // Create round rows
    const roundTypes = buildRoundTypes(DEFAULT_FORMAT.round_count);
    const roundRows = roundTypes.map((roundType, index) => ({
      debate_id: debate.id,
      round_number: index + 1,
      round_type: roundType,
      phase: 'countdown',
      timer_duration_seconds: DEFAULT_FORMAT.speaking_time_seconds,
    }));

    await supabaseAdmin.from('rounds').insert(roundRows);

    // Update challenge with debate_id and accepted status
    const { data: updatedChallenge, error: updateError } = await supabaseAdmin
      .from('challenges')
      .update({ status: 'accepted', debate_id: debate.id })
      .eq('id', challenge_id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update challenge', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        challenge: updatedChallenge,
        debate: { ...debate, agora_channel_id: debate.id },
        message: 'Challenge accepted! Debate created.',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
