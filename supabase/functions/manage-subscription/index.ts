// supabase/functions/manage-subscription/index.ts
// Handle subscription activation and cancellation.
// MVP stub — no real Stripe integration; directly activates/cancels.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ACTIONS = ['activate', 'cancel'] as const;
const VALID_TIERS = ['clash_plus'] as const;

const SUBSCRIPTION_DURATION_DAYS = 30;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // --- Parse & validate input ---
    const body = await req.json();
    const { action, tier } = body;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return jsonResponse(
        { error: `action must be one of: ${VALID_ACTIONS.join(', ')}` },
        400,
      );
    }

    // Default tier to 'clash_plus' if not provided
    const resolvedTier = tier ?? 'clash_plus';
    if (!VALID_TIERS.includes(resolvedTier)) {
      return jsonResponse(
        { error: `tier must be one of: ${VALID_TIERS.join(', ')}` },
        400,
      );
    }

    // --- Activate ---
    if (action === 'activate') {
      // Check if user already has an active subscription
      const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (existing) {
        return jsonResponse(
          { error: 'User already has an active subscription', subscription: existing },
          409,
        );
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000);

      // Insert subscription row
      const { data: subscription, error: insertError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: user.id,
          tier: resolvedTier,
          is_active: true,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create subscription:', insertError);
        return jsonResponse(
          { error: 'Failed to create subscription', details: insertError.message },
          500,
        );
      }

      // Update profile subscription tier
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ subscription_tier: resolvedTier })
        .eq('id', user.id);

      if (profileError) {
        console.error('Failed to update profile tier:', profileError);
        // Non-fatal — subscription was created. Log and continue.
      }

      return jsonResponse({ subscription }, 201);
    }

    // --- Cancel ---
    if (action === 'cancel') {
      // Find active subscription
      const { data: activeSub, error: findError } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error('Failed to find subscription:', findError);
        return jsonResponse(
          { error: 'Failed to look up subscription', details: findError.message },
          500,
        );
      }

      if (!activeSub) {
        return jsonResponse({ error: 'No active subscription found' }, 404);
      }

      // Deactivate subscription
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({ is_active: false })
        .eq('id', activeSub.id);

      if (updateError) {
        console.error('Failed to cancel subscription:', updateError);
        return jsonResponse(
          { error: 'Failed to cancel subscription', details: updateError.message },
          500,
        );
      }

      // Reset profile to free tier
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ subscription_tier: 'free' })
        .eq('id', user.id);

      if (profileError) {
        console.error('Failed to reset profile tier:', profileError);
        // Non-fatal — subscription was cancelled. Log and continue.
      }

      return jsonResponse({ success: true, message: 'Subscription cancelled' }, 200);
    }

    // Should not reach here due to validation above
    return jsonResponse({ error: 'Unhandled action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});
