export enum AdvisorTopic {
  PRICING = 'pricing',
  MARKETING = 'marketing',
  OPERATIONS = 'operations',
}

export interface AdvisorAnswer {
  inScope: boolean;
  topic: AdvisorTopic | null;
  title: string;
  answer: string;
}

// ─── Raw repository metric shapes (advisor-only queries) ───────────────────

export interface ReviewStats {
  count: number;
  averageRating: number;
}

export interface ClientGrowth {
  newThisMonth: number;
  newLastMonth: number;
}

export interface TopClientBySpend {
  name: string;
  totalSpent: number;
}
