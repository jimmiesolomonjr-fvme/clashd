-- Clashd Initial Schema
-- Creates all core tables, enums, indexes, and RLS policies

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE debate_status AS ENUM (
  'draft', 'scheduled', 'waiting_room', 'countdown', 'live', 'paused', 'completed', 'cancelled'
);

CREATE TYPE round_phase AS ENUM (
  'countdown', 'side_a_speaking', 'side_a_transition', 'side_b_speaking',
  'side_b_transition', 'voting', 'score_reveal', 'completed'
);

CREATE TYPE round_type AS ENUM (
  'opening', 'standard', 'rebuttal', 'closing', 'special'
);

CREATE TYPE debate_format AS ENUM (
  'classic', 'rapid', 'extended', 'custom'
);

CREATE TYPE special_round_type AS ENUM (
  'rapid_fire', 'audience_question', 'wildcard'
);

CREATE TYPE report_reason AS ENUM (
  'hate_speech', 'harassment', 'spam', 'inappropriate', 'other'
);

CREATE TYPE report_status AS ENUM (
  'pending', 'reviewed', 'dismissed', 'action_taken'
);

CREATE TYPE subscription_tier AS ENUM (
  'free', 'clash_plus'
);

CREATE TYPE challenge_status AS ENUM (
  'pending', 'accepted', 'declined', 'expired'
);

-- ============================================
-- TABLES
-- ============================================

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  phone_hash TEXT,
  clash_rating INTEGER NOT NULL DEFAULT 1000,
  total_debates INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_expires_at TIMESTAMPTZ,
  strike_count INTEGER NOT NULL DEFAULT 0,
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_clash_rating ON profiles(clash_rating DESC);
CREATE INDEX idx_profiles_phone_hash ON profiles(phone_hash) WHERE phone_hash IS NOT NULL;

-- Debates
CREATE TABLE debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  description TEXT,
  format debate_format NOT NULL DEFAULT 'classic',
  status debate_status NOT NULL DEFAULT 'draft',
  side_a_user_id UUID NOT NULL REFERENCES profiles(id),
  side_b_user_id UUID NOT NULL REFERENCES profiles(id),
  side_a_label TEXT NOT NULL DEFAULT 'For',
  side_b_label TEXT NOT NULL DEFAULT 'Against',
  winner_user_id UUID REFERENCES profiles(id),
  round_count INTEGER NOT NULL DEFAULT 3,
  speaking_time_seconds INTEGER NOT NULL DEFAULT 120,
  voting_time_seconds INTEGER NOT NULL DEFAULT 10,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  audience_count INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  agora_channel_id TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT debates_different_sides CHECK (side_a_user_id != side_b_user_id)
);

CREATE INDEX idx_debates_status ON debates(status);
CREATE INDEX idx_debates_live_public ON debates(audience_count DESC) WHERE status = 'live' AND is_public = TRUE;
CREATE INDEX idx_debates_scheduled ON debates(scheduled_at ASC) WHERE status IN ('scheduled', 'waiting_room');
CREATE INDEX idx_debates_side_a ON debates(side_a_user_id);
CREATE INDEX idx_debates_side_b ON debates(side_b_user_id);
CREATE INDEX idx_debates_created_by ON debates(created_by);

-- Rounds
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  round_type round_type NOT NULL DEFAULT 'standard',
  phase round_phase NOT NULL DEFAULT 'countdown',
  timer_started_at TIMESTAMPTZ,
  timer_duration_seconds INTEGER NOT NULL DEFAULT 120,
  current_speaker_id UUID REFERENCES profiles(id),
  side_a_score_argument NUMERIC(3,1),
  side_a_score_delivery NUMERIC(3,1),
  side_a_score_persuasion NUMERIC(3,1),
  side_b_score_argument NUMERIC(3,1),
  side_b_score_delivery NUMERIC(3,1),
  side_b_score_persuasion NUMERIC(3,1),
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(debate_id, round_number)
);

CREATE INDEX idx_rounds_debate ON rounds(debate_id);

-- Special Rounds
CREATE TABLE special_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  special_type special_round_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Votes (one per user per round)
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  side_a_argument INTEGER NOT NULL CHECK (side_a_argument BETWEEN 1 AND 5),
  side_a_delivery INTEGER NOT NULL CHECK (side_a_delivery BETWEEN 1 AND 5),
  side_a_persuasion INTEGER NOT NULL CHECK (side_a_persuasion BETWEEN 1 AND 5),
  side_b_argument INTEGER NOT NULL CHECK (side_b_argument BETWEEN 1 AND 5),
  side_b_delivery INTEGER NOT NULL CHECK (side_b_delivery BETWEEN 1 AND 5),
  side_b_persuasion INTEGER NOT NULL CHECK (side_b_persuasion BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(round_id, user_id)
);

CREATE INDEX idx_votes_round ON votes(round_id);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_debate ON comments(debate_id, created_at ASC);

-- Challenges
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id UUID NOT NULL REFERENCES profiles(id),
  challenged_id UUID NOT NULL REFERENCES profiles(id),
  topic TEXT NOT NULL,
  message TEXT,
  status challenge_status NOT NULL DEFAULT 'pending',
  debate_id UUID REFERENCES debates(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT challenges_different_users CHECK (challenger_id != challenged_id)
);

CREATE INDEX idx_challenges_challenged ON challenges(challenged_id, status);
CREATE INDEX idx_challenges_challenger ON challenges(challenger_id);

-- Follows
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CONSTRAINT follows_no_self CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- Reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id),
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  reason report_reason NOT NULL,
  details TEXT,
  status report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_reports_debate ON reports(debate_id, created_at DESC);
CREATE INDEX idx_reports_pending ON reports(status) WHERE status = 'pending';

-- Audience Meter Snapshots
CREATE TABLE audience_meter_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id),
  side_a_percentage NUMERIC(5,2) NOT NULL,
  side_b_percentage NUMERIC(5,2) NOT NULL,
  sample_size INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audience_meter_debate ON audience_meter_snapshots(debate_id, captured_at DESC);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  tier subscription_tier NOT NULL DEFAULT 'free',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, is_active);

-- Bookmarks
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, debate_id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_debates_updated_at
  BEFORE UPDATE ON debates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_rounds_updated_at
  BEFORE UPDATE ON rounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_challenges_updated_at
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::TEXT, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_meter_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Profiles: public read, own write
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Debates: public read for public debates, participants can modify
CREATE POLICY "Public debates are viewable by everyone"
  ON debates FOR SELECT USING (is_public = true OR auth.uid() IN (side_a_user_id, side_b_user_id, created_by));

CREATE POLICY "Authenticated users can create debates"
  ON debates FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Debate participants can update"
  ON debates FOR UPDATE USING (auth.uid() IN (side_a_user_id, side_b_user_id));

-- Rounds: readable if debate is accessible
CREATE POLICY "Rounds are viewable with debate"
  ON rounds FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM debates
      WHERE debates.id = rounds.debate_id
      AND (debates.is_public = true OR auth.uid() IN (debates.side_a_user_id, debates.side_b_user_id))
    )
  );

-- Votes: write-once per user per round
CREATE POLICY "Votes are viewable after voting period"
  ON votes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can vote once per round"
  ON votes FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM votes v WHERE v.round_id = votes.round_id AND v.user_id = auth.uid()
    )
  );

-- Comments: public read, authenticated write
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment"
  ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Challenges: involved parties only
CREATE POLICY "Users can see their own challenges"
  ON challenges FOR SELECT USING (auth.uid() IN (challenger_id, challenged_id));

CREATE POLICY "Authenticated users can create challenges"
  ON challenges FOR INSERT WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Challenged user can respond"
  ON challenges FOR UPDATE USING (auth.uid() = challenged_id);

-- Follows: public read, own write
CREATE POLICY "Follows are viewable by everyone"
  ON follows FOR SELECT USING (true);

CREATE POLICY "Users can follow"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE USING (auth.uid() = follower_id);

-- Reports: own reports visible, write own
CREATE POLICY "Users can see their own reports"
  ON reports FOR SELECT USING (auth.uid() = reporter_id);

CREATE POLICY "Authenticated users can report"
  ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Audience meter: public read
CREATE POLICY "Audience meter snapshots are viewable"
  ON audience_meter_snapshots FOR SELECT USING (true);

-- Subscriptions: own only
CREATE POLICY "Users can see own subscriptions"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Bookmarks: own only
CREATE POLICY "Users can see own bookmarks"
  ON bookmarks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create bookmarks"
  ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- Special rounds: readable with round
CREATE POLICY "Special rounds viewable with round"
  ON special_rounds FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN debates d ON d.id = r.debate_id
      WHERE r.id = special_rounds.round_id
      AND (d.is_public = true OR auth.uid() IN (d.side_a_user_id, d.side_b_user_id))
    )
  );

-- ============================================
-- REALTIME PUBLICATIONS
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE debates;
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
