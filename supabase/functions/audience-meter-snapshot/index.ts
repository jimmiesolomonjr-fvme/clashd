// supabase/functions/audience-meter-snapshot/index.ts
// Captures a live sentiment snapshot during the voting phase of a debate round.
// Fetches all votes for the round, calculates percentages, inserts a snapshot,
// and broadcasts the meter update to the debate channel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SnapshotInput {
  debate_id: string;
  round_id: string;
}

function validateSnapshotInput(body: unknown): { data: SnapshotInput | null; errors: string[] } {
  const errors: string[] = [];
  const data = body as Record<string, unknown>;

  if (!data || typeof data !== 'object') {
    return { data: null, errors: ['Request body must be a JSON object'] };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!data.debate_id || typeof data.debate_id !== 'string' || !uuidRegex.test(data.debate_id)) {
    errors.push('debate_id must be a valid UUID');
  }

  if (!data.round_id || typeof data.round_id !== 'string' || !uuidRegex.test(data.round_id)) {
    errors.push('round_id must be a valid UUID');
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  return { data: data as unknown as SnapshotInput, errors: [] };
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
    const { data: input, errors } = validateSnapshotInput(body);

    if (errors.length > 0 || !input) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch the round
    const { data: round, error: roundError } = await supabaseAdmin
      .from('rounds')
      .select('*')
      .eq('id', input.round_id)
      .eq('debate_id', input.debate_id)
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

    // Fetch all votes for this round
    const { data: votes, error: votesError } = await supabaseAdmin
      .from('votes')
      .select('side_a_argument, side_a_delivery, side_a_persuasion, side_b_argument, side_b_delivery, side_b_persuasion')
      .eq('round_id', input.round_id);

    if (votesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch votes', details: votesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const voteCount = votes?.length || 0;

    // If no votes yet, return early with 50/50 split
    if (voteCount === 0) {
      const emptySnapshot = {
        debate_id: input.debate_id,
        round_id: input.round_id,
        side_a_percentage: 50.0,
        side_b_percentage: 50.0,
        sample_size: 0,
      };

      const { data: snapshot, error: snapshotError } = await supabaseAdmin
        .from('audience_meter_snapshots')
        .insert(emptySnapshot)
        .select()
        .single();

      if (snapshotError) {
        return new Response(
          JSON.stringify({ error: 'Failed to create snapshot', details: snapshotError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Broadcast the audience meter update
      const channelName = `debate:${input.debate_id}`;
      await supabaseAdmin.channel(channelName).send({
        type: 'broadcast',
        event: 'message',
        payload: {
          type: 'audience_meter',
          side_a_percentage: 50.0,
          side_b_percentage: 50.0,
          sample_size: 0,
        },
      });

      return new Response(
        JSON.stringify({
          snapshot,
          message: 'Snapshot captured with no votes (50/50 split)',
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Calculate total scores for each side
    let sideATotal = 0;
    let sideBTotal = 0;

    for (const vote of votes) {
      sideATotal += vote.side_a_argument + vote.side_a_delivery + vote.side_a_persuasion;
      sideBTotal += vote.side_b_argument + vote.side_b_delivery + vote.side_b_persuasion;
    }

    const totalScores = sideATotal + sideBTotal;

    // Calculate percentages
    let sideAPercentage = 50.0;
    let sideBPercentage = 50.0;

    if (totalScores > 0) {
      sideAPercentage = (sideATotal / totalScores) * 100;
      sideBPercentage = (sideBTotal / totalScores) * 100;
    }

    // Insert the snapshot
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('audience_meter_snapshots')
      .insert({
        debate_id: input.debate_id,
        round_id: input.round_id,
        side_a_percentage: sideAPercentage,
        side_b_percentage: sideBPercentage,
        sample_size: voteCount,
      })
      .select()
      .single();

    if (snapshotError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create snapshot', details: snapshotError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Broadcast the audience meter update
    const channelName = `debate:${input.debate_id}`;
    await supabaseAdmin.channel(channelName).send({
      type: 'broadcast',
      event: 'message',
      payload: {
        type: 'audience_meter',
        side_a_percentage: sideAPercentage,
        side_b_percentage: sideBPercentage,
        sample_size: voteCount,
      },
    });

    return new Response(
      JSON.stringify({
        snapshot,
        message: 'Snapshot captured successfully',
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
