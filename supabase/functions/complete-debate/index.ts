// supabase/functions/complete-debate/index.ts
// Declare winner, update Elo ratings, and finalize the debate.
// Sums scores across all rounds, determines winner, updates profiles
// (clash_rating, total_debates, total_wins), and sets debate completion fields.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATING_K_FACTOR = 32;

/** Calculate Clash Rating change (Elo-like) */
function calculateRatingChange(
  winnerRating: number,
  loserRating: number,
  kFactor: number = RATING_K_FACTOR,
): { winnerDelta: number; loserDelta: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const winnerDelta = Math.round(kFactor * (1 - expectedWinner));
  const loserDelta = Math.round(kFactor * (0 - expectedLoser));

  return { winnerDelta, loserDelta };
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

    const { debate_id } = await req.json();

    if (!debate_id) {
      return new Response(
        JSON.stringify({ error: 'debate_id is required' }),
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

    // Only participants or creator can complete
    const isParticipant = [debate.side_a_user_id, debate.side_b_user_id, debate.created_by].includes(user.id);
    if (!isParticipant) {
      return new Response(
        JSON.stringify({ error: 'Only debate participants can complete a debate' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Debate must be live (or already completed for idempotency)
    if (debate.status === 'completed') {
      return new Response(
        JSON.stringify({
          message: 'Debate already completed',
          debate_id: debate.id,
          winner_user_id: debate.winner_user_id,
          already_completed: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (debate.status !== 'live') {
      return new Response(
        JSON.stringify({ error: `Debate is not live (current status: ${debate.status})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch all rounds for this debate with their scores
    const { data: rounds, error: roundsError } = await supabaseAdmin
      .from('rounds')
      .select('*')
      .eq('debate_id', debate_id)
      .order('round_number', { ascending: true });

    if (roundsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rounds', details: roundsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Verify all rounds are in score_reveal or completed phase
    const unfinishedRounds = (rounds || []).filter(
      (r: { phase: string }) => r.phase !== 'score_reveal' && r.phase !== 'completed',
    );

    if (unfinishedRounds.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'Not all rounds are finalized',
          unfinished_rounds: unfinishedRounds.map((r: { round_number: number; phase: string }) => ({
            round_number: r.round_number,
            phase: r.phase,
          })),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Sum scores across all rounds
    let sideATotalScore = 0;
    let sideBTotalScore = 0;

    for (const round of (rounds || [])) {
      const sideAArg = Number(round.side_a_score_argument) || 0;
      const sideADel = Number(round.side_a_score_delivery) || 0;
      const sideAPer = Number(round.side_a_score_persuasion) || 0;
      const sideBArg = Number(round.side_b_score_argument) || 0;
      const sideBDel = Number(round.side_b_score_delivery) || 0;
      const sideBPer = Number(round.side_b_score_persuasion) || 0;

      sideATotalScore += sideAArg + sideADel + sideAPer;
      sideBTotalScore += sideBArg + sideBDel + sideBPer;
    }

    // Round to 1 decimal
    sideATotalScore = Math.round(sideATotalScore * 10) / 10;
    sideBTotalScore = Math.round(sideBTotalScore * 10) / 10;

    // Determine winner
    let winnerUserId: string | null = null;
    let outcome: 'side_a' | 'side_b' | 'tie';

    if (sideATotalScore > sideBTotalScore) {
      winnerUserId = debate.side_a_user_id;
      outcome = 'side_a';
    } else if (sideBTotalScore > sideATotalScore) {
      winnerUserId = debate.side_b_user_id;
      outcome = 'side_b';
    } else {
      winnerUserId = null;
      outcome = 'tie';
    }

    // Fetch both profiles for rating update
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, clash_rating, total_debates, total_wins')
      .in('id', [debate.side_a_user_id, debate.side_b_user_id]);

    if (profilesError || !profiles || profiles.length !== 2) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch debater profiles', details: profilesError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const sideAProfile = profiles.find((p: { id: string }) => p.id === debate.side_a_user_id)!;
    const sideBProfile = profiles.find((p: { id: string }) => p.id === debate.side_b_user_id)!;

    // Calculate rating changes
    let sideANewRating = sideAProfile.clash_rating;
    let sideBNewRating = sideBProfile.clash_rating;
    let sideAWins = sideAProfile.total_wins;
    let sideBWins = sideBProfile.total_wins;

    if (outcome === 'side_a') {
      const { winnerDelta, loserDelta } = calculateRatingChange(
        sideAProfile.clash_rating,
        sideBProfile.clash_rating,
      );
      sideANewRating = sideAProfile.clash_rating + winnerDelta;
      sideBNewRating = sideBProfile.clash_rating + loserDelta;
      sideAWins = sideAProfile.total_wins + 1;
    } else if (outcome === 'side_b') {
      const { winnerDelta, loserDelta } = calculateRatingChange(
        sideBProfile.clash_rating,
        sideAProfile.clash_rating,
      );
      sideBNewRating = sideBProfile.clash_rating + winnerDelta;
      sideANewRating = sideAProfile.clash_rating + loserDelta;
      sideBWins = sideBProfile.total_wins + 1;
    }
    // In case of tie, ratings don't change

    // Ensure ratings don't go below 0
    sideANewRating = Math.max(0, sideANewRating);
    sideBNewRating = Math.max(0, sideBNewRating);

    // Update profiles
    const profileUpdates = [
      supabaseAdmin
        .from('profiles')
        .update({
          clash_rating: sideANewRating,
          total_debates: sideAProfile.total_debates + 1,
          total_wins: sideAWins,
        })
        .eq('id', debate.side_a_user_id),
      supabaseAdmin
        .from('profiles')
        .update({
          clash_rating: sideBNewRating,
          total_debates: sideBProfile.total_debates + 1,
          total_wins: sideBWins,
        })
        .eq('id', debate.side_b_user_id),
    ];

    const profileResults = await Promise.all(profileUpdates);
    const profileErrors = profileResults.filter((r) => r.error);
    if (profileErrors.length > 0) {
      console.error('Some profile updates failed:', profileErrors.map((r) => r.error));
    }

    // Mark all rounds as completed
    const { error: roundsCompleteError } = await supabaseAdmin
      .from('rounds')
      .update({ phase: 'completed' })
      .eq('debate_id', debate_id);

    if (roundsCompleteError) {
      console.error('Failed to mark rounds as completed:', roundsCompleteError);
    }

    // Update the debate
    const now = new Date().toISOString();
    const { data: updatedDebate, error: debateUpdateError } = await supabaseAdmin
      .from('debates')
      .update({
        status: 'completed',
        winner_user_id: winnerUserId,
        completed_at: now,
      })
      .eq('id', debate_id)
      .eq('status', 'live') // Optimistic lock
      .select()
      .single();

    if (debateUpdateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to complete debate', details: debateUpdateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        debate: updatedDebate,
        result: {
          outcome,
          winner_user_id: winnerUserId,
          side_a_total_score: sideATotalScore,
          side_b_total_score: sideBTotalScore,
          rating_changes: {
            side_a: {
              user_id: debate.side_a_user_id,
              old_rating: sideAProfile.clash_rating,
              new_rating: sideANewRating,
              delta: sideANewRating - sideAProfile.clash_rating,
            },
            side_b: {
              user_id: debate.side_b_user_id,
              old_rating: sideBProfile.clash_rating,
              new_rating: sideBNewRating,
              delta: sideBNewRating - sideBProfile.clash_rating,
            },
          },
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
