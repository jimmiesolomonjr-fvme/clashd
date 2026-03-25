// supabase/functions/process-report/index.ts
// Handle community reports against live debates.
// Creates a report row, checks if 3+ reports in the last 60 seconds,
// and if the threshold is hit, pauses the debate and broadcasts a notification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Constants matching packages/shared/src/utils/constants.ts
const REPORT_WINDOW_MS = 60_000; // 60 seconds
const REPORT_THRESHOLD_FOR_PAUSE = 3;

const VALID_REASONS = ['hate_speech', 'harassment', 'spam', 'inappropriate', 'other'];

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

    const { debate_id, reason, details } = await req.json();

    // Validate input
    if (!debate_id) {
      return new Response(
        JSON.stringify({ error: 'debate_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!reason || !VALID_REASONS.includes(reason)) {
      return new Response(
        JSON.stringify({ error: `reason must be one of: ${VALID_REASONS.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (details !== undefined && details !== null) {
      if (typeof details !== 'string' || details.length > 1000) {
        return new Response(
          JSON.stringify({ error: 'details must be a string under 1000 characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Verify the debate exists and is live
    const { data: debate, error: debateError } = await supabaseAdmin
      .from('debates')
      .select('id, status, side_a_user_id, side_b_user_id')
      .eq('id', debate_id)
      .single();

    if (debateError || !debate) {
      return new Response(
        JSON.stringify({ error: 'Debate not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Users cannot report their own debate
    if (user.id === debate.side_a_user_id || user.id === debate.side_b_user_id) {
      return new Response(
        JSON.stringify({ error: 'Debaters cannot report their own debate' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Only allow reporting live or paused debates
    if (debate.status !== 'live' && debate.status !== 'paused') {
      return new Response(
        JSON.stringify({ error: `Cannot report a debate with status "${debate.status}"` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create the report row
    const { data: report, error: reportError } = await supabaseAdmin
      .from('reports')
      .insert({
        debate_id,
        reporter_id: user.id,
        reason,
        details: details || null,
        status: 'pending',
      })
      .select()
      .single();

    if (reportError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create report', details: reportError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if we've hit the threshold: 3+ reports in the last 60 seconds
    const windowStart = new Date(Date.now() - REPORT_WINDOW_MS).toISOString();

    const { data: recentReports, error: countError } = await supabaseAdmin
      .from('reports')
      .select('id', { count: 'exact' })
      .eq('debate_id', debate_id)
      .gte('created_at', windowStart);

    if (countError) {
      console.error('Failed to count recent reports:', countError);
      // Non-fatal — report was still created
      return new Response(
        JSON.stringify({ report, threshold_hit: false }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const recentCount = recentReports?.length ?? 0;
    const thresholdHit = recentCount >= REPORT_THRESHOLD_FOR_PAUSE;

    let debatePaused = false;

    if (thresholdHit && debate.status === 'live') {
      // Pause the debate
      const { error: pauseError } = await supabaseAdmin
        .from('debates')
        .update({ status: 'paused' })
        .eq('id', debate_id)
        .eq('status', 'live'); // Optimistic lock

      if (pauseError) {
        console.error('Failed to pause debate:', pauseError);
      } else {
        debatePaused = true;

        // Broadcast the pause notification via Realtime
        const channelName = `debate:${debate_id}`;
        try {
          await supabaseAdmin.channel(channelName).send({
            type: 'broadcast',
            event: 'debate_paused',
            payload: {
              type: 'debate_paused',
              reason: 'community_reports',
              report_count: recentCount,
              message: 'This debate has been paused due to multiple community reports.',
              timestamp: Date.now(),
            },
          });

          // Also mute both debaters
          await supabaseAdmin.channel(channelName).send({
            type: 'broadcast',
            event: 'mute_control',
            payload: {
              type: 'mute_control',
              target_user_id: debate.side_a_user_id,
              muted: true,
              reason: 'moderation',
            },
          });

          await supabaseAdmin.channel(channelName).send({
            type: 'broadcast',
            event: 'mute_control',
            payload: {
              type: 'mute_control',
              target_user_id: debate.side_b_user_id,
              muted: true,
              reason: 'moderation',
            },
          });
        } catch (broadcastErr) {
          console.error('Failed to broadcast pause notification:', broadcastErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        report,
        recent_report_count: recentCount,
        threshold: REPORT_THRESHOLD_FOR_PAUSE,
        threshold_hit: thresholdHit,
        debate_paused: debatePaused,
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
