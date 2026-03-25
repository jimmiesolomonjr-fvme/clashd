// Auto-generated types — run `supabase gen types` to refresh
// For now, this provides a minimal type structure

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
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
          is_admin: boolean;
          is_banned: boolean;
          ban_expires_at: string | null;
          strike_count: number;
          subscription_tier: 'free' | 'clash_plus';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          phone_hash?: string | null;
          clash_rating?: number;
          total_debates?: number;
          total_wins?: number;
          is_verified?: boolean;
          is_admin?: boolean;
          is_banned?: boolean;
          ban_expires_at?: string | null;
          strike_count?: number;
          subscription_tier?: 'free' | 'clash_plus';
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          phone_hash?: string | null;
          clash_rating?: number;
          total_debates?: number;
          total_wins?: number;
          is_verified?: boolean;
          is_admin?: boolean;
          is_banned?: boolean;
          ban_expires_at?: string | null;
          strike_count?: number;
          subscription_tier?: 'free' | 'clash_plus';
        };
        Relationships: [];
      };
      debates: {
        Row: {
          id: string;
          topic: string;
          description: string | null;
          format: 'classic' | 'rapid' | 'extended' | 'custom';
          status: 'draft' | 'scheduled' | 'waiting_room' | 'countdown' | 'live' | 'paused' | 'completed' | 'cancelled';
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
        };
        Insert: {
          id?: string;
          topic: string;
          description?: string | null;
          format?: 'classic' | 'rapid' | 'extended' | 'custom';
          status?: 'draft' | 'scheduled' | 'waiting_room' | 'countdown' | 'live' | 'paused' | 'completed' | 'cancelled';
          side_a_user_id: string;
          side_b_user_id: string;
          side_a_label?: string;
          side_b_label?: string;
          round_count?: number;
          speaking_time_seconds?: number;
          voting_time_seconds?: number;
          scheduled_at?: string | null;
          is_public?: boolean;
          created_by: string;
        };
        Update: {
          id?: string;
          topic?: string;
          description?: string | null;
          format?: 'classic' | 'rapid' | 'extended' | 'custom';
          status?: 'draft' | 'scheduled' | 'waiting_room' | 'countdown' | 'live' | 'paused' | 'completed' | 'cancelled';
          side_a_user_id?: string;
          side_b_user_id?: string;
          side_a_label?: string;
          side_b_label?: string;
          winner_user_id?: string | null;
          round_count?: number;
          speaking_time_seconds?: number;
          voting_time_seconds?: number;
          scheduled_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          audience_count?: number;
          is_public?: boolean;
          agora_channel_id?: string | null;
          created_by?: string;
        };
        Relationships: [];
      };
      rounds: {
        Row: {
          id: string;
          debate_id: string;
          round_number: number;
          round_type: 'opening' | 'standard' | 'rebuttal' | 'closing' | 'special';
          phase: 'countdown' | 'side_a_speaking' | 'side_a_transition' | 'side_b_speaking' | 'side_b_transition' | 'voting' | 'score_reveal' | 'completed';
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
        };
        Insert: {
          id?: string;
          debate_id: string;
          round_number: number;
          round_type?: 'opening' | 'standard' | 'rebuttal' | 'closing' | 'special';
          phase?: 'countdown' | 'side_a_speaking' | 'side_a_transition' | 'side_b_speaking' | 'side_b_transition' | 'voting' | 'score_reveal' | 'completed';
          timer_duration_seconds?: number;
        };
        Update: {
          id?: string;
          debate_id?: string;
          round_number?: number;
          round_type?: 'opening' | 'standard' | 'rebuttal' | 'closing' | 'special';
          phase?: 'countdown' | 'side_a_speaking' | 'side_a_transition' | 'side_b_speaking' | 'side_b_transition' | 'voting' | 'score_reveal' | 'completed';
          timer_started_at?: string | null;
          timer_duration_seconds?: number;
          current_speaker_id?: string | null;
          side_a_score_argument?: number | null;
          side_a_score_delivery?: number | null;
          side_a_score_persuasion?: number | null;
          side_b_score_argument?: number | null;
          side_b_score_delivery?: number | null;
          side_b_score_persuasion?: number | null;
          vote_count?: number;
        };
        Relationships: [];
      };
      votes: {
        Row: {
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
        };
        Insert: {
          id?: string;
          round_id: string;
          user_id: string;
          side_a_argument: number;
          side_a_delivery: number;
          side_a_persuasion: number;
          side_b_argument: number;
          side_b_delivery: number;
          side_b_persuasion: number;
        };
        Update: {
          id?: string;
          round_id?: string;
          user_id?: string;
          side_a_argument?: number;
          side_a_delivery?: number;
          side_a_persuasion?: number;
          side_b_argument?: number;
          side_b_delivery?: number;
          side_b_persuasion?: number;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          debate_id: string;
          user_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          debate_id: string;
          user_id: string;
          content: string;
        };
        Update: {
          id?: string;
          debate_id?: string;
          user_id?: string;
          content?: string;
        };
        Relationships: [];
      };
      challenges: {
        Row: {
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
        };
        Insert: {
          id?: string;
          challenger_id: string;
          challenged_id: string;
          topic: string;
          message?: string | null;
          status?: 'pending' | 'accepted' | 'declined' | 'expired';
          debate_id?: string | null;
          expires_at: string;
        };
        Update: {
          id?: string;
          challenger_id?: string;
          challenged_id?: string;
          topic?: string;
          message?: string | null;
          status?: 'pending' | 'accepted' | 'declined' | 'expired';
          debate_id?: string | null;
          expires_at?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          debate_id: string;
          reporter_id: string;
          reason: 'hate_speech' | 'harassment' | 'spam' | 'inappropriate' | 'other';
          details: string | null;
          status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          debate_id: string;
          reporter_id: string;
          reason: 'hate_speech' | 'harassment' | 'spam' | 'inappropriate' | 'other';
          details?: string | null;
          status?: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
        };
        Update: {
          id?: string;
          debate_id?: string;
          reporter_id?: string;
          reason?: 'hate_speech' | 'harassment' | 'spam' | 'inappropriate' | 'other';
          details?: string | null;
          status?: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      audience_meter_snapshots: {
        Row: {
          id: string;
          debate_id: string;
          round_id: string | null;
          side_a_percentage: number;
          side_b_percentage: number;
          sample_size: number;
          captured_at: string;
        };
        Insert: {
          id?: string;
          debate_id: string;
          round_id?: string | null;
          side_a_percentage: number;
          side_b_percentage: number;
          sample_size: number;
        };
        Update: {
          id?: string;
          debate_id?: string;
          round_id?: string | null;
          side_a_percentage?: number;
          side_b_percentage?: number;
          sample_size?: number;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          tier: 'free' | 'clash_plus';
          started_at: string;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tier: 'free' | 'clash_plus';
          started_at?: string;
          expires_at?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          tier?: 'free' | 'clash_plus';
          started_at?: string;
          expires_at?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      bookmarks: {
        Row: {
          id: string;
          user_id: string;
          debate_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          debate_id: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          debate_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      debate_status: 'draft' | 'scheduled' | 'waiting_room' | 'countdown' | 'live' | 'paused' | 'completed' | 'cancelled';
      round_phase: 'countdown' | 'side_a_speaking' | 'side_a_transition' | 'side_b_speaking' | 'side_b_transition' | 'voting' | 'score_reveal' | 'completed';
      round_type: 'opening' | 'standard' | 'rebuttal' | 'closing' | 'special';
      debate_format: 'classic' | 'rapid' | 'extended' | 'custom';
      special_round_type: 'rapid_fire' | 'audience_question' | 'wildcard';
      report_reason: 'hate_speech' | 'harassment' | 'spam' | 'inappropriate' | 'other';
      report_status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
      subscription_tier: 'free' | 'clash_plus';
    };
  };
}
