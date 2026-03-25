// Debate constants
export const COUNTDOWN_SECONDS = 3;
export const MIN_AUDIENCE_FOR_VOTING = 1;
export const REPORT_WINDOW_MS = 60_000;
export const REPORT_THRESHOLD_FOR_PAUSE = 3;

// Rating
export const DEFAULT_CLASH_RATING = 1000;
export const RATING_K_FACTOR = 32;

// Moderation
export const STRIKE_THRESHOLDS = {
  FIRST: { strikes: 3, ban_days: 7 },
  SECOND: { strikes: 6, ban_days: 30 },
  PERMANENT: { strikes: 9, ban_days: null }, // permanent
};

// Subscription
export const CLASH_PLUS_PRICE_CENTS = 499;

// Agora
export const AGORA_TOKEN_EXPIRY_SECONDS = 3600;

// Real-time
export const AUDIENCE_METER_SNAPSHOT_INTERVAL_MS = 30_000;
export const MAX_COMMENT_LENGTH = 500;
export const REACTION_THROTTLE_MS = 500;
