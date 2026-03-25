// supabase/functions/submit-vote/index.ts
// Validated vote submission for a debate round.
// Checks round is in 'voting' phase, validates score ranges (1-5),
// enforces one vote per user per round via UNIQUE constraint,
// and increments round vote_count.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VoteInput {
  round_id: string;
  side_a_argument: number;
  side_a_delivery: number;
  side_a_persuasion: number;
  side_b_argument: number;
  side_b_delivery: number;
  side_b_persuasion: number;
}

function validateVoteInput(body: unknown): { data: VoteInput | null; errors: string[] } {
  const errors: string[] = [];
  const data = body as Record<string, unknown>;

  if (!data || typeof data !== 'object') {
    return { data: null, errors: ['Request body must be a JSON object'] };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!data.round_id || typeof data.round_id !== 'string' || !uuidRegex.test(data.round_id)) {
    errors.push('round_id must be a valid UUID');
  }

  const scoreFields = [
    'side_a_argument', 'side_a_delivery', 'side_a_persuasion',
    'side_b_argument', 'side_b_delivery', 'side_b_persuasion',
  ];

  for (const field of scoreFields) {
    const value = data[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`${field} must be an integer between 1 and 5`);
    }
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  return { data: data as unknown as VoteInput, errors: [] };
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

    // Parse and validate input
    const body = await req.json();
    const { data: input, errors } = validateVoteInput(body);

    if (errors.length > 0 || !input) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch the round and its debate
    const { data: round, error: roundError } = await supabaseAdmin
      .from('rounds')
      .select('*, debates!inner(id, side_a_user_id, side_b_user_id, status)')
      .eq('id', input.round_id)
      .single();

    if (roundError || !round) {
      return new Response(
        JSON.stringify({ error: 'Round not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Verify the round is in the voting phase
    if (round.phase !== 'voting') {
      return new Response(
        JSON.stringify({
          error: `Round is not in voting phase (current phase: ${round.phase})`,
          current_phase: round.phase,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Verify the debate is live
    const debate = round.debates;
    if (debate.status !== 'live') {
      return new Response(
        JSON.stringify({ error: 'Debate is not live' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Debaters cannot vote in their own debate
    if (user.id === debate.side_a_user_id || user.id === debate.side_b_user_id) {
      return new Response(
        JSON.stringify({ error: 'Debaters cannot vote in their own debate' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Insert the vote — UNIQUE(round_id, user_id) constraint handles duplicates
    const { data: vote, error: voteError } = await supabaseAdmin
      .from('votes')
      .insert({
        round_id: input.round_id,
        user_id: user.id,
        side_a_argument: input.side_a_argument,
        side_a_delivery: input.side_a_delivery,
        side_a_persuasion: input.side_a_persuasion,
        side_b_argument: input.side_b_argument,
        side_b_delivery: input.side_b_delivery,
        side_b_persuasion: input.side_b_persuasion,
      })
      .select()
      .single();

    if (voteError) {
      // Check for unique constraint violation (duplicate vote)
      if (voteError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'You have already voted for this round' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to submit vote', details: voteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Increment vote_count on the round.
    // Try the RPC first (atomic increment). If it fails (e.g., RPC not deployed),
    // fall back to a read-then-write approach.
    const rpcResult = await supabaseAdmin.rpc('increment_vote_count', {
      p_round_id: input.round_id,
    });

    if (rpcResult.error) {
      // Fallback: manual increment (not perfectly atomic but sufficient)
      const { data: currentRound } = await supabaseAdmin
        .from('rounds')
        .select('vote_count')
        .eq('id', input.round_id)
        .single();

      const { error: fallbackError } = await supabaseAdmin
        .from('rounds')
        .update({ vote_count: (currentRound?.vote_count ?? 0) + 1 })
        .eq('id', input.round_id);

      if (fallbackError) {
        console.error('Failed to increment vote count (fallback):', fallbackError);
        // Non-fatal — the vote was still recorded
      }
    }

    return new Response(
      JSON.stringify({
        vote,
        message: 'Vote submitted successfully',
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
