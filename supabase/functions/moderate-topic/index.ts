// supabase/functions/moderate-topic/index.ts
// AI pre-screening of debate topics.
// Currently uses a blocklist approach as a placeholder.
// Returns { approved: boolean, reason?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Blocklist of prohibited terms and patterns
// These are lowercased for case-insensitive matching
const BLOCKED_TERMS = [
  // Violence and threats
  'kill', 'murder', 'execute', 'assassinate', 'genocide', 'ethnic cleansing',
  'mass shooting', 'bomb threat', 'terrorism how to', 'make a bomb',

  // Targeted hate
  'racial superiority', 'white supremacy', 'holocaust denial',
  'race war', 'exterminate',

  // Illegal activity
  'how to manufacture drugs', 'how to hack', 'child exploitation',
  'child abuse', 'human trafficking',

  // Self-harm
  'suicide methods', 'how to self harm',
];

// Patterns that are suspicious but may need context
const WARNING_PATTERNS = [
  /\b(should\s+we\s+)?(legalize|ban)\s+(all\s+)?(drugs|weapons|firearms)\b/i,
  /\b(is\s+it\s+ok\s+to|should\s+we)\s+(attack|bomb|destroy)\b/i,
];

// Maximum topic length
const MAX_TOPIC_LENGTH = 200;
const MIN_TOPIC_LENGTH = 5;

interface ModerationResult {
  approved: boolean;
  reason?: string;
  flags?: string[];
  confidence: number;
}

function moderateTopic(topic: string): ModerationResult {
  const flags: string[] = [];
  const normalized = topic.toLowerCase().trim();

  // Length checks
  if (normalized.length < MIN_TOPIC_LENGTH) {
    return {
      approved: false,
      reason: `Topic must be at least ${MIN_TOPIC_LENGTH} characters`,
      confidence: 1.0,
    };
  }

  if (normalized.length > MAX_TOPIC_LENGTH) {
    return {
      approved: false,
      reason: `Topic must be under ${MAX_TOPIC_LENGTH} characters`,
      confidence: 1.0,
    };
  }

  // Check against blocklist
  for (const term of BLOCKED_TERMS) {
    if (normalized.includes(term.toLowerCase())) {
      flags.push(`blocked_term:${term}`);
    }
  }

  if (flags.length > 0) {
    return {
      approved: false,
      reason: 'Topic contains prohibited content that violates community guidelines',
      flags,
      confidence: 0.95,
    };
  }

  // Check warning patterns
  const warnings: string[] = [];
  for (const pattern of WARNING_PATTERNS) {
    if (pattern.test(normalized)) {
      warnings.push(`warning_pattern:${pattern.source}`);
    }
  }

  // Excessive caps check (more than 60% uppercase, excluding short topics)
  if (topic.length > 10) {
    const uppercaseRatio = (topic.match(/[A-Z]/g) || []).length / topic.length;
    if (uppercaseRatio > 0.6) {
      warnings.push('excessive_caps');
    }
  }

  // Excessive special characters (potential spam)
  const specialCharRatio = (topic.match(/[^a-zA-Z0-9\s.,?!'-]/g) || []).length / topic.length;
  if (specialCharRatio > 0.3) {
    flags.push('excessive_special_chars');
    return {
      approved: false,
      reason: 'Topic contains too many special characters',
      flags,
      confidence: 0.8,
    };
  }

  // Repetition check (repeated characters or words)
  if (/(.)\1{5,}/.test(normalized)) {
    flags.push('character_repetition');
    return {
      approved: false,
      reason: 'Topic contains excessive character repetition',
      flags,
      confidence: 0.85,
    };
  }

  // Word repetition check
  const words = normalized.split(/\s+/);
  if (words.length >= 3) {
    const uniqueWords = new Set(words);
    if (uniqueWords.size < words.length * 0.3) {
      flags.push('word_repetition');
      return {
        approved: false,
        reason: 'Topic contains excessive word repetition',
        flags,
        confidence: 0.8,
      };
    }
  }

  // If there are warnings but no blocks, approve with reduced confidence
  if (warnings.length > 0) {
    return {
      approved: true,
      flags: warnings,
      confidence: 0.7,
      reason: 'Topic approved but flagged for review',
    };
  }

  return {
    approved: true,
    confidence: 0.95,
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

    const { topic } = await req.json();

    if (!topic || typeof topic !== 'string') {
      return new Response(
        JSON.stringify({ error: 'topic is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = moderateTopic(topic);

    return new Response(
      JSON.stringify(result),
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
