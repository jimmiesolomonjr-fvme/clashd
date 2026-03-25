// supabase/functions/agora-token/index.ts
// Generate Agora RTC tokens for debate audio/video channels

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Agora token generation constants
const VERSION = '007';
const ROLE_PUBLISHER = 1;
const ROLE_SUBSCRIBER = 2;

// ---- HMAC-SHA256 token builder (Deno-native, no npm dependency) ----

function encodeUint32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint16(0, (value >> 16) & 0xffff, false);
  view.setUint16(2, value & 0xffff, false);
  return buf;
}

function encodeUint16(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  const view = new DataView(buf.buffer);
  view.setUint16(0, value & 0xffff, false);
  return buf;
}

function encodeString(str: string): Uint8Array {
  const encoded = new TextEncoder().encode(str);
  const lenBuf = encodeUint16(encoded.length);
  const result = new Uint8Array(lenBuf.length + encoded.length);
  result.set(lenBuf, 0);
  result.set(encoded, lenBuf.length);
  return result;
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const totalLen = buffers.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

function toBase64(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}

// Privilege constants
const kJoinChannel = 1;
const kPublishAudioStream = 2;
const kPublishVideoStream = 3;
const kPublishDataStream = 4;

interface Privileges {
  [key: number]: number; // privilege type => expiry timestamp
}

function packPrivileges(privileges: Privileges): Uint8Array {
  const entries = Object.entries(privileges);
  const parts: Uint8Array[] = [encodeUint16(entries.length)];
  for (const [key, value] of entries) {
    parts.push(encodeUint16(Number(key)));
    parts.push(encodeUint32(value));
  }
  return concatBuffers(...parts);
}

async function generateAgoraToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: number,
  privilegeExpiredTs: number,
): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const salt = Math.floor(Math.random() * 0xffffffff);

  // Build privileges map
  const privileges: Privileges = {};
  privileges[kJoinChannel] = privilegeExpiredTs;
  if (role === ROLE_PUBLISHER) {
    privileges[kPublishAudioStream] = privilegeExpiredTs;
    privileges[kPublishVideoStream] = privilegeExpiredTs;
    privileges[kPublishDataStream] = privilegeExpiredTs;
  }

  // Build the message to sign
  const messageContent = concatBuffers(
    encodeUint32(salt),
    encodeUint32(ts),
    encodeUint32(uid),
    encodeUint32(privilegeExpiredTs),
    packPrivileges(privileges),
  );

  // Sign with HMAC-SHA256
  const toSign = concatBuffers(
    new TextEncoder().encode(appId),
    new TextEncoder().encode(channelName),
    new TextEncoder().encode(String(uid)),
    messageContent,
  );

  const keyBuf = new TextEncoder().encode(appCertificate);
  const signature = await hmacSha256(keyBuf, toSign);

  // Pack the final token
  const content = concatBuffers(
    encodeString(toBase64(signature)),
    encodeUint32(0), // crc_channel_name placeholder
    encodeUint32(0), // crc_uid placeholder
    messageContent,
  );

  const tokenBuf = concatBuffers(
    new TextEncoder().encode(VERSION),
    encodeString(appId),
    content,
  );

  return toBase64(tokenBuf);
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const agoraAppId = Deno.env.get('AGORA_APP_ID');
    const agoraCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');

    if (!agoraAppId || !agoraCertificate) {
      return new Response(
        JSON.stringify({ error: 'Agora credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create an authenticated Supabase client to verify the user
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Parse request body
    const { channelId, userId, role } = await req.json();

    if (!channelId || !userId || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: channelId, userId, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (role !== 'host' && role !== 'audience') {
      return new Response(
        JSON.stringify({ error: 'Role must be "host" or "audience"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Generate a numeric UID from the user ID (hash the UUID to a 32-bit int)
    const uidBytes = new TextEncoder().encode(userId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', uidBytes);
    const hashArray = new Uint8Array(hashBuffer);
    const uid = ((hashArray[0] << 24) | (hashArray[1] << 16) | (hashArray[2] << 8) | hashArray[3]) >>> 0;

    const expirySeconds = 3600; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirySeconds;

    const agoraRole = role === 'host' ? ROLE_PUBLISHER : ROLE_SUBSCRIBER;

    const token = await generateAgoraToken(
      agoraAppId,
      agoraCertificate,
      channelId,
      uid,
      agoraRole,
      privilegeExpiredTs,
    );

    const response = {
      token,
      uid,
      channelId,
      expiresAt: privilegeExpiredTs,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
