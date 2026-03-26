-- suggested_topics: AI-generated debate topics refreshed every 6 hours

CREATE TABLE suggested_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  category TEXT NOT NULL,
  side_a_label TEXT DEFAULT 'For',
  side_b_label TEXT DEFAULT 'Against',
  is_active BOOLEAN DEFAULT TRUE,
  used_count INTEGER DEFAULT 0,
  batch_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching active topics efficiently
CREATE INDEX idx_suggested_topics_active ON suggested_topics (is_active, created_at DESC);

-- RLS
ALTER TABLE suggested_topics ENABLE ROW LEVEL SECURITY;

-- Anyone can read active topics
CREATE POLICY "Public read active topics"
  ON suggested_topics FOR SELECT
  USING (is_active = true);

-- Only service role can insert/update (Edge Function uses service role key)
-- No user-facing insert/update policies needed
