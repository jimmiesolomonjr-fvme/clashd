// Core database types matching the Supabase schema

export type DebateStatus =
  | 'draft'
  | 'scheduled'
  | 'waiting_room'
  | 'countdown'
  | 'live'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type RoundPhase =
  | 'countdown'
  | 'side_a_speaking'
  | 'side_a_transition'
  | 'side_b_speaking'
  | 'side_b_transition'
  | 'voting'
  | 'score_reveal'
  | 'completed';

export type RoundType = 'opening' | 'standard' | 'rebuttal' | 'closing' | 'special';

export type DebateFormat = 'classic' | 'rapid' | 'extended' | 'custom';

export type SpecialRoundType = 'rapid_fire' | 'audience_question' | 'wildcard';

export type ReportReason = 'hate_speech' | 'harassment' | 'spam' | 'inappropriate' | 'other';

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken';

export type SubscriptionTier = 'free' | 'clash_plus';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone_hash: string | null;
  clash_rating: number;
  total_debates: number;
  total_wins: number;
  is_verified: boolean;
  is_banned: boolean;
  ban_expires_at: string | null;
  strike_count: number;
  subscription_tier: SubscriptionTier;
  created_at: string;
  updated_at: string;
}

export interface Debate {
  id: string;
  topic: string;
  description: string | null;
  format: DebateFormat;
  status: DebateStatus;
  side_a_user_id: string;
  side_b_user_id: string;
  side_a_label: string;
  side_b_label: string;
  winner_user_id: string | null;
  round_count: number;
  speaking_time_seconds: number;
  voting_time_seconds: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  audience_count: number;
  is_public: boolean;
  agora_channel_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  debate_id: string;
  round_number: number;
  round_type: RoundType;
  phase: RoundPhase;
  timer_started_at: string | null;
  timer_duration_seconds: number;
  current_speaker_id: string | null;
  side_a_score_argument: number | null;
  side_a_score_delivery: number | null;
  side_a_score_persuasion: number | null;
  side_b_score_argument: number | null;
  side_b_score_delivery: number | null;
  side_b_score_persuasion: number | null;
  vote_count: number;
  created_at: string;
  updated_at: string;
}

export interface SpecialRound {
  id: string;
  round_id: string;
  special_type: SpecialRoundType;
  config: Record<string, unknown>;
  created_at: string;
}

export interface Vote {
  id: string;
  round_id: string;
  user_id: string;
  side_a_argument: number;
  side_a_delivery: number;
  side_a_persuasion: number;
  side_b_argument: number;
  side_b_delivery: number;
  side_b_persuasion: number;
  created_at: string;
}

export interface Comment {
  id: string;
  debate_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface Challenge {
  id: string;
  challenger_id: string;
  challenged_id: string;
  topic: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  debate_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Report {
  id: string;
  debate_id: string;
  reporter_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface AudienceMeterSnapshot {
  id: string;
  debate_id: string;
  round_id: string | null;
  side_a_percentage: number;
  side_b_percentage: number;
  sample_size: number;
  captured_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  started_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  debate_id: string;
  created_at: string;
}

export type TopicCategory = 'entertainment' | 'culture' | 'sports' | 'politics' | 'relationships';

export interface SuggestedTopic {
  id: string;
  topic: string;
  category: TopicCategory;
  side_a_label: string;
  side_b_label: string;
  is_active: boolean;
  used_count: number;
  batch_id: string;
  created_at: string;
}
