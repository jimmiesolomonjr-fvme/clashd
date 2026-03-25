// supabase/functions/verify-phone/index.ts
// Phone verification placeholder.
// Stores a SHA-256 hash of the phone number on the user's profile
// and sets is_verified = true.
//
// In production, this would integrate with an SMS provider (Twilio, etc.)
// to send and verify a 6-digit OTP code. For now, it accepts the phone
// number and code, validates the code format, and marks the user as verified.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// E.164 phone format: + followed by 1-15 digits
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const CODE_LENGTH = 6;

async function hashPhone(phone: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  // Convert to hex string
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

    const { phone, code } = await req.json();

    // Validate phone number (E.164 format)
    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return new Response(
        JSON.stringify({ error: 'Phone number must be in E.164 format (e.g., +14155551234)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validate verification code format
    if (!code || typeof code !== 'string' || code.length !== CODE_LENGTH || !/^\d+$/.test(code)) {
      return new Response(
        JSON.stringify({ error: `Verification code must be ${CODE_LENGTH} digits` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if user is already verified
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_verified, phone_hash')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (profile.is_verified) {
      return new Response(
        JSON.stringify({
          message: 'Phone already verified',
          is_verified: true,
          already_verified: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- PLACEHOLDER VERIFICATION LOGIC ----
    // In production, this would:
    // 1. Look up the stored OTP for this phone number from a verification table
    // 2. Check the code matches
    // 3. Check the code hasn't expired (typically 10 min window)
    // 4. Check rate limits (max attempts)
    //
    // For now, we accept any valid 6-digit code as a placeholder.
    // In a real implementation, you'd add:
    //   const { data: verification } = await supabaseAdmin
    //     .from('phone_verifications')
    //     .select('*')
    //     .eq('phone', phone)
    //     .eq('code', code)
    //     .gt('expires_at', new Date().toISOString())
    //     .single();
    //   if (!verification) { return error "Invalid or expired code" }
    // ---- END PLACEHOLDER ----

    // Hash the phone number for privacy-preserving storage
    const phoneHash = await hashPhone(phone);

    // Check if this phone hash is already used by another account
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('phone_hash', phoneHash)
      .neq('id', user.id)
      .maybeSingle();

    if (existingError) {
      return new Response(
        JSON.stringify({ error: 'Failed to check phone uniqueness', details: existingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'This phone number is already associated with another account' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Update the profile with phone hash and verification status
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        phone_hash: phoneHash,
        is_verified: true,
      })
      .eq('id', user.id)
      .select('id, username, is_verified, phone_hash')
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update profile', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        message: 'Phone verified successfully',
        is_verified: true,
        profile: {
          id: updatedProfile.id,
          username: updatedProfile.username,
          is_verified: updatedProfile.is_verified,
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
