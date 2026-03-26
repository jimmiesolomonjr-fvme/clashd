// supabase/functions/generate-topics/index.ts
// Generates 50 controversial debate topics using Anthropic Claude Haiku.
// Called by GitHub Actions cron every 6 hours. Authenticated via CRON_SECRET header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const TOPIC_PROMPT = `You are a debate topic generator for Clashd, a live video debate app focused on the Black community, entertainment, pop culture, and TMZ-style subjects.

Generate exactly 50 controversial, engaging debate topics. Each topic should be something people would passionately argue about. Focus on:
- Black culture, community issues, and perspectives
- Hip-hop, R&B, and music industry drama
- Celebrity gossip and TMZ-style controversies
- Sports (NBA, NFL, boxing, etc.)
- Relationships, dating, and family dynamics
- Social media culture and influencers
- Movies, TV shows, and streaming content
- Fashion, style, and trends
- Current events relevant to the Black community
- Food, lifestyle, and generational debates

Rules:
- Topics should be debatable with two clear sides
- Keep topics spicy but not hateful or discriminatory
- No topics promoting violence or illegal activity
- Each topic should be a clear, concise statement or question (under 150 characters)
- Provide specific side labels that are more engaging than just "For"/"Against"
- Categories must be one of: entertainment, culture, sports, politics, relationships

Respond with ONLY a JSON array, no markdown, no explanation. Each element must have:
- "topic": the debate topic string
- "category": one of "entertainment", "culture", "sports", "politics", "relationships"
- "side_a_label": label for side A (the "yes/for" position)
- "side_b_label": label for side B (the "no/against" position)

Example format:
[{"topic":"Beyoncé is the greatest performer of all time","category":"entertainment","side_a_label":"Queen Bey Forever","side_b_label":"She's Overrated"},{"topic":"Should men pay for every date?","category":"relationships","side_a_label":"Yes, Always","side_b_label":"Split the Bill"}]`;

interface GeneratedTopic {
  topic: string;
  category: string;
  side_a_label: string;
  side_b_label: string;
}

const VALID_CATEGORIES = ['entertainment', 'culture', 'sports', 'politics', 'relationships'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth via CRON_SECRET header
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');

    if (!expectedSecret || cronSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Call Anthropic Claude Haiku API
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [
          { role: 'user', content: TOPIC_PROMPT },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: 'Anthropic API error', details: errBody }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicData = await anthropicRes.json();
    let rawText = anthropicData.content?.[0]?.text ?? '';

    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Parse the JSON response
    let topics: GeneratedTopic[];
    try {
      topics = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', raw: rawText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      return new Response(
        JSON.stringify({ error: 'AI returned empty or invalid topics array' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validate and sanitize topics
    const validTopics = topics
      .filter((t) =>
        t.topic && typeof t.topic === 'string' &&
        t.category && VALID_CATEGORIES.includes(t.category) &&
        t.side_a_label && typeof t.side_a_label === 'string' &&
        t.side_b_label && typeof t.side_b_label === 'string'
      )
      .slice(0, 50);

    if (validTopics.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid topics after filtering' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Deactivate previous batch
    const { error: deactivateError } = await supabase
      .from('suggested_topics')
      .update({ is_active: false })
      .eq('is_active', true);

    if (deactivateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to deactivate old topics', details: deactivateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Insert new batch
    const batchId = `batch_${Date.now()}`;
    const rows = validTopics.map((t) => ({
      topic: t.topic.slice(0, 200),
      category: t.category,
      side_a_label: t.side_a_label.slice(0, 50),
      side_b_label: t.side_b_label.slice(0, 50),
      is_active: true,
      batch_id: batchId,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('suggested_topics')
      .insert(rows)
      .select('id');

    if (insertError) {
      return new Response(
        JSON.stringify({ error: 'Failed to insert topics', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        batch_id: batchId,
        count: inserted?.length ?? validTopics.length,
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
