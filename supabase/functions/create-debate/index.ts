// supabase/functions/create-debate/index.ts
// Create a new debate with rounds based on format configuration

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Format presets matching packages/shared/src/schemas/debate.ts
const FORMAT_PRESETS: Record<
  string,
  { round_count: number; speaking_time_seconds: number; voting_time_seconds: number }
> = {
  classic: { round_count: 3, speaking_time_seconds: 120, voting_time_seconds: 10 },
  rapid: { round_count: 5, speaking_time_seconds: 60, voting_time_seconds: 10 },
  extended: { round_count: 3, speaking_time_seconds: 300, voting_time_seconds: 15 },
};

// Inline validation matching CreateDebateInput shape
interface CreateDebateInput {
  topic: string;
  description?: string;
  format?: 'classic' | 'rapid' | 'extended' | 'custom';
  side_a_label?: string;
  side_b_label?: string;
  round_count?: number;
  speaking_time_seconds?: number;
  voting_time_seconds?: number;
  is_public?: boolean;
  scheduled_at?: string;
  opponent_id?: string;
}

function validateInput(body: unknown): { data: CreateDebateInput; errors: string[] } {
  const errors: string[] = [];
  const data = body as Record<string, unknown>;

  if (!data || typeof data !== 'object') {
    return { data: {} as CreateDebateInput, errors: ['Request body must be a JSON object'] };
  }

  // topic: required, 5-200 chars
  if (typeof data.topic !== 'string' || data.topic.length < 5 || data.topic.length > 200) {
    errors.push('topic must be a string between 5 and 200 characters');
  }

  // description: optional, max 1000 chars
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string' || (data.description as string).length > 1000) {
      errors.push('description must be a string under 1000 characters');
    }
  }

  // format
  const validFormats = ['classic', 'rapid', 'extended', 'custom'];
  if (data.format !== undefined && !validFormats.includes(data.format as string)) {
    errors.push('format must be one of: classic, rapid, extended, custom');
  }

  // side labels
  if (data.side_a_label !== undefined) {
    if (typeof data.side_a_label !== 'string' || (data.side_a_label as string).length < 1 || (data.side_a_label as string).length > 50) {
      errors.push('side_a_label must be a string between 1 and 50 characters');
    }
  }
  if (data.side_b_label !== undefined) {
    if (typeof data.side_b_label !== 'string' || (data.side_b_label as string).length < 1 || (data.side_b_label as string).length > 50) {
      errors.push('side_b_label must be a string between 1 and 50 characters');
    }
  }

  // round_count: 1-10
  if (data.round_count !== undefined) {
    if (typeof data.round_count !== 'number' || !Number.isInteger(data.round_count) || data.round_count < 1 || data.round_count > 10) {
      errors.push('round_count must be an integer between 1 and 10');
    }
  }

  // speaking_time_seconds: 30-600
  if (data.speaking_time_seconds !== undefined) {
    if (typeof data.speaking_time_seconds !== 'number' || !Number.isInteger(data.speaking_time_seconds) || data.speaking_time_seconds < 30 || data.speaking_time_seconds > 600) {
      errors.push('speaking_time_seconds must be an integer between 30 and 600');
    }
  }

  // voting_time_seconds: 5-60
  if (data.voting_time_seconds !== undefined) {
    if (typeof data.voting_time_seconds !== 'number' || !Number.isInteger(data.voting_time_seconds) || data.voting_time_seconds < 5 || data.voting_time_seconds > 60) {
      errors.push('voting_time_seconds must be an integer between 5 and 60');
    }
  }

  // is_public: boolean
  if (data.is_public !== undefined && typeof data.is_public !== 'boolean') {
    errors.push('is_public must be a boolean');
  }

  // opponent_id: uuid pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (data.opponent_id !== undefined && (typeof data.opponent_id !== 'string' || !uuidRegex.test(data.opponent_id as string))) {
    errors.push('opponent_id must be a valid UUID');
  }

  return { data: data as CreateDebateInput, errors };
}

// Build round types based on total rounds (matches debate-machine.ts logic)
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
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // User client for auth verification
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

    // Service-role client for writes (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate input
    const body = await req.json();
    const { data: input, errors } = validateInput(body);

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Apply format presets for non-custom formats
    const format = input.format || 'classic';
    const preset = FORMAT_PRESETS[format];
    const roundCount = input.round_count ?? preset?.round_count ?? 3;
    const speakingTime = input.speaking_time_seconds ?? preset?.speaking_time_seconds ?? 120;
    const votingTime = input.voting_time_seconds ?? preset?.voting_time_seconds ?? 10;

    // Validate opponent exists if provided
    let opponentId = input.opponent_id;
    if (opponentId) {
      if (opponentId === user.id) {
        return new Response(
          JSON.stringify({ error: 'Cannot debate yourself' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: opponent, error: opponentError } = await supabaseAdmin
        .from('profiles')
        .select('id, is_banned')
        .eq('id', opponentId)
        .single();

      if (opponentError || !opponent) {
        return new Response(
          JSON.stringify({ error: 'Opponent not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (opponent.is_banned) {
        return new Response(
          JSON.stringify({ error: 'Opponent is currently banned' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // If no opponent specified, we need a placeholder — the creator is side_a,
    // side_b is set when someone accepts the challenge/joins.
    // For now, require opponent_id to create a full debate.
    if (!opponentId) {
      return new Response(
        JSON.stringify({ error: 'opponent_id is required to create a debate' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Determine initial status
    const initialStatus = input.scheduled_at ? 'scheduled' : 'waiting_room';

    // Create the debate row
    const { data: debate, error: debateError } = await supabaseAdmin
      .from('debates')
      .insert({
        topic: input.topic,
        description: input.description || null,
        format,
        status: initialStatus,
        side_a_user_id: user.id,
        side_b_user_id: opponentId,
        side_a_label: input.side_a_label || 'For',
        side_b_label: input.side_b_label || 'Against',
        round_count: roundCount,
        speaking_time_seconds: speakingTime,
        voting_time_seconds: votingTime,
        is_public: input.is_public ?? true,
        scheduled_at: input.scheduled_at || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (debateError || !debate) {
      return new Response(
        JSON.stringify({ error: 'Failed to create debate', details: debateError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Set agora_channel_id = debate.id
    const { error: updateError } = await supabaseAdmin
      .from('debates')
      .update({ agora_channel_id: debate.id })
      .eq('id', debate.id);

    if (updateError) {
      console.error('Failed to set agora_channel_id:', updateError);
    }

    // Create round rows
    const roundTypes = buildRoundTypes(roundCount);
    const roundRows = roundTypes.map((roundType, index) => ({
      debate_id: debate.id,
      round_number: index + 1,
      round_type: roundType,
      phase: 'countdown',
      timer_duration_seconds: speakingTime,
    }));

    const { data: rounds, error: roundsError } = await supabaseAdmin
      .from('rounds')
      .insert(roundRows)
      .select();

    if (roundsError) {
      // Roll back debate creation if rounds fail
      await supabaseAdmin.from('debates').delete().eq('id', debate.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create rounds', details: roundsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Return the created debate with agora_channel_id set
    const responseDebate = { ...debate, agora_channel_id: debate.id };

    return new Response(
      JSON.stringify({ debate: responseDebate, rounds }),
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
