export enum SuggestionTag {
  QUICK_WIN = 'quick_win',
  SUGGESTED = 'suggested',
  HIGH_IMPACT = 'high_impact',
}

export enum SuggestionId {
  CLIENT_FOLLOW_UPS = 'client-follow-ups',
  COMPLETE_STALE_JOBS = 'complete-stale-jobs',
  SET_REVENUE_TARGET = 'set-revenue-target',
  SEND_PAYMENT_REMINDERS = 'send-payment-reminders',
  OPTIMIZE_PRICING = 'optimize-pricing',
}

export interface Suggestion {
  id: SuggestionId;
  text: string;
  tag: SuggestionTag;
}

export interface SuggestionsResult {
  count: number;
  suggestions: Suggestion[];
}

export interface ApplySuggestionResult {
  id: SuggestionId;
  summary: string;
  remaining: number;
}

export interface DismissSuggestionResult {
  id: SuggestionId;
  remaining: number;
}

// ─── Raw repository shapes ──────────────────────────────────────────────────

export interface IdleClient {
  clientId: string;
  name: string;
  email: string;
}
