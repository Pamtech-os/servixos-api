export enum InsightCategory {
  REVENUE = 'revenue',
  CLIENTS = 'clients',
  OPERATIONS = 'operations',
  GROWTH = 'growth',
}

export enum InsightSeverity {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export interface InsightAction {
  label: string;
  link: string;
}

export interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  description: string;
  severity: InsightSeverity;
  action?: InsightAction;
}

export interface InsightCategorySummary {
  key: InsightCategory;
  label: string;
  count: number;
}

export interface InsightsResult {
  categories: InsightCategorySummary[];
  insights: Insight[];
}

// ─── Raw repository metric shapes ───────────────────────────────────────────

export interface UnpaidInvoicesSummary {
  count: number;
  totalOutstanding: number;
}

export interface ProjectValueWindows {
  currentAvg: number;
  previousAvg: number;
}

export interface MonthlyRevenuePoint {
  month: string;
  revenue: number;
}

export interface PendingContractSummary {
  clientName: string;
  amount: number;
}

export interface SchedulingClusterCandidate {
  location: string;
  count: number;
}

export interface JobCompletionStats {
  completed: number;
  total: number;
}
