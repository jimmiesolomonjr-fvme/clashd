// supabase/functions/send-challenge/index.ts
// Create a new challenge from one user to another

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHALLENGE_EXPIRY_HOURS = 24;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // Validate input
    const { challenged_id, topic, message } = body;

    if (!challenged_id || typeof challenged_id !== 'string' || !uuidRegex.test(challenged_id)) {
      return new Response(
        JSON.stringify({ error: 'challenged_id must be a valid UUID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (typeof topic !== 'string' || topic.length < 5 || topic.length > 200) {
      return new Response(
        JSON.stringify({ error: 'topic must be a string between 5 and 200 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (message !== undefined && message !== null && (typeof message !== 'string' || message.length > 500)) {
      return new Response(
        JSON.stringify({ error: 'message must be a string under 500 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Cannot challenge yourself
    if (challenged_id === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot challenge yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check challenged user exists and is not banned
    const { data: challenged, error: challengedError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_banned')
      .eq('id', challenged_id)
      .single();

    if (challengedError || !challenged) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (challenged.is_banned) {
      return new Response(
        JSON.stringify({ error: 'User is currently banned' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check for existing pending challenge between these users on same topic
    const { data: existing } = await supabaseAdmin
      .from('challenges')
      .select('id')
      .eq('challenger_id', user.id)
      .eq('challenged_id', challenged_id)
      .eq('status', 'pending')
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: 'You already have a pending challenge to this user' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create the challenge
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const { data: challenge, error: insertError } = await supabaseAdmin
      .from('challenges')
      .insert({
        challenger_id: user.id,
        challenged_id,
        topic,
        message: message || null,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select(
        `
        *,
        challenger:profiles!challenges_challenger_id_fkey(id, username, display_name, avatar_url),
        challenged:profiles!challenges_challenged_id_fkey(id, username, display_name, avatar_url)
      `,
      )
      .single();

    if (insertError || !challenge) {
      return new Response(
        JSON.stringify({ error: 'Failed to create challenge', details: insertError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ challenge }),
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
