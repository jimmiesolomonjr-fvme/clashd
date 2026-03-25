// supabase/functions/finalize-round/index.ts
// Calculate aggregate scores for a round.
// Fetches all votes, computes averages for each scoring dimension,
// updates the round with scores, and sets phase to 'score_reveal'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AggregatedScores {
  side_a_argument: number;
  side_a_delivery: number;
  side_a_persuasion: number;
  side_a_total: number;
  side_b_argument: number;
  side_b_delivery: number;
  side_b_persuasion: number;
  side_b_total: number;
  vote_count: number;
  winner: 'side_a' | 'side_b' | 'tie';
}

interface Vote {
  side_a_argument: number;
  side_a_delivery: number;
  side_a_persuasion: number;
  side_b_argument: number;
  side_b_delivery: number;
  side_b_persuasion: number;
}

function aggregateVotes(votes: Vote[]): AggregatedScores {
  if (votes.length === 0) {
    return {
      side_a_argument: 0,
      side_a_delivery: 0,
      side_a_persuasion: 0,
      side_a_total: 0,
      side_b_argument: 0,
      side_b_delivery: 0,
      side_b_persuasion: 0,
      side_b_total: 0,
      vote_count: 0,
      winner: 'tie',
    };
  }

  const count = votes.length;
  const sum = votes.reduce(
    (acc, vote) => ({
      side_a_argument: acc.side_a_argument + vote.side_a_argument,
      side_a_delivery: acc.side_a_delivery + vote.side_a_delivery,
      side_a_persuasion: acc.side_a_persuasion + vote.side_a_persuasion,
      side_b_argument: acc.side_b_argument + vote.side_b_argument,
      side_b_delivery: acc.side_b_delivery + vote.side_b_delivery,
      side_b_persuasion: acc.side_b_persuasion + vote.side_b_persuasion,
    }),
    {
      side_a_argument: 0,
      side_a_delivery: 0,
      side_a_persuasion: 0,
      side_b_argument: 0,
      side_b_delivery: 0,
      side_b_persuasion: 0,
    },
  );

  const avg = (n: number) => Math.round((n / count) * 10) / 10;

  const side_a_argument = avg(sum.side_a_argument);
  const side_a_delivery = avg(sum.side_a_delivery);
  const side_a_persuasion = avg(sum.side_a_persuasion);
  const side_a_total = Math.round((side_a_argument + side_a_delivery + side_a_persuasion) * 10) / 10;

  const side_b_argument = avg(sum.side_b_argument);
  const side_b_delivery = avg(sum.side_b_delivery);
  const side_b_persuasion = avg(sum.side_b_persuasion);
  const side_b_total = Math.round((side_b_argument + side_b_delivery + side_b_persuasion) * 10) / 10;

  let winner: 'side_a' | 'side_b' | 'tie';
  if (side_a_total > side_b_total) winner = 'side_a';
  else if (side_b_total > side_a_total) winner = 'side_b';
  else winner = 'tie';

  return {
    side_a_argument,
    side_a_delivery,
    side_a_persuasion,
    side_a_total,
    side_b_argument,
    side_b_delivery,
    side_b_persuasion,
    side_b_total,
    vote_count: count,
    winner,
  };
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

    const { round_id } = await req.json();

    if (!round_id) {
      return new Response(
        JSON.stringify({ error: 'round_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch the round with its debate
    const { data: round, error: roundError } = await supabaseAdmin
      .from('rounds')
      .select('*, debates!inner(id, side_a_user_id, side_b_user_id, status, created_by)')
      .eq('id', round_id)
      .single();

    if (roundError || !round) {
      return new Response(
        JSON.stringify({ error: 'Round not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const debate = round.debates;

    // Only debate participants or creator can finalize
    const isParticipant = [debate.side_a_user_id, debate.side_b_user_id, debate.created_by].includes(user.id);
    if (!isParticipant) {
      return new Response(
        JSON.stringify({ error: 'Only debate participants can finalize a round' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Round must be in voting phase or already in score_reveal (idempotent)
    if (round.phase !== 'voting' && round.phase !== 'score_reveal') {
      return new Response(
        JSON.stringify({
          error: `Round is not in voting phase (current phase: ${round.phase})`,
          current_phase: round.phase,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // If already finalized (score_reveal with scores set), return existing scores
    if (round.phase === 'score_reveal' && round.side_a_score_argument !== null) {
      return new Response(
        JSON.stringify({
          message: 'Round already finalized',
          round_id: round.id,
          scores: {
            side_a_argument: round.side_a_score_argument,
            side_a_delivery: round.side_a_score_delivery,
            side_a_persuasion: round.side_a_score_persuasion,
            side_b_argument: round.side_b_score_argument,
            side_b_delivery: round.side_b_score_delivery,
            side_b_persuasion: round.side_b_score_persuasion,
            vote_count: round.vote_count,
          },
          already_finalized: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch all votes for this round
    const { data: votes, error: votesError } = await supabaseAdmin
      .from('votes')
      .select('side_a_argument, side_a_delivery, side_a_persuasion, side_b_argument, side_b_delivery, side_b_persuasion')
      .eq('round_id', round_id);

    if (votesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch votes', details: votesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Compute aggregate scores
    const scores = aggregateVotes(votes || []);

    // Update the round with scores and transition to score_reveal
    const { data: updatedRound, error: updateError } = await supabaseAdmin
      .from('rounds')
      .update({
        phase: 'score_reveal',
        side_a_score_argument: scores.side_a_argument,
        side_a_score_delivery: scores.side_a_delivery,
        side_a_score_persuasion: scores.side_a_persuasion,
        side_b_score_argument: scores.side_b_argument,
        side_b_score_delivery: scores.side_b_delivery,
        side_b_score_persuasion: scores.side_b_persuasion,
        vote_count: scores.vote_count,
        current_speaker_id: null,
        timer_started_at: null,
        timer_duration_seconds: 0,
      })
      .eq('id', round_id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update round scores', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        round: updatedRound,
        scores: {
          side_a_argument: scores.side_a_argument,
          side_a_delivery: scores.side_a_delivery,
          side_a_persuasion: scores.side_a_persuasion,
          side_a_total: scores.side_a_total,
          side_b_argument: scores.side_b_argument,
          side_b_delivery: scores.side_b_delivery,
          side_b_persuasion: scores.side_b_persuasion,
          side_b_total: scores.side_b_total,
          vote_count: scores.vote_count,
          round_winner: scores.winner,
        },
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
