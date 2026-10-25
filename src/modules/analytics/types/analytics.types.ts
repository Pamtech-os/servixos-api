/** Single data point in the daily traffic chart */
export interface DailyTrafficPoint {
  /** ISO date string in business-local time e.g. "2026-04-08" */
  date: string;
  /** Unique visitors on this day (counted by distinct sessionId) */
  visitors: number;
  /** Total page-view events on this day */
  pageViews: number;
}

export interface TopPage {
  /** Relative page path e.g. "/" or "/services" */
  page: string;
  views: number;
  /** Share of total page views e.g. 45.2 */
  percentage: number;
}

export interface TrafficStats {
  totalVisitors: number;
  totalPageViews: number;
  /** Mean page views per day over the queried period */
  dailyAverage: number;
  /** (serviceRequests / uniqueVisitors) * 100 */
  conversionRate: number;
}

export interface TrafficAnalytics {
  trafficData: DailyTrafficPoint[];
  topPages: TopPage[];
  stats: TrafficStats;
}

export interface MonthlyRevenuePoint {
  /** Month key e.g. "2026-04" */
  month: string;
  /** Sum of payment amounts in this month */
  revenue: number;
  /** Number of payments collected */
  count: number;
}

export interface JobStatusPoint {
  status: string;
  count: number;
  percentage: number;
}

export interface OutstandingInvoices {
  count: number;
  /** Sum of (totalAmount - amountPaid) for pending/partial invoices */
  totalAmount: number;
}

export interface TopClient {
  clientId: string;
  name: string;
  email: string;
  totalSpent: number;
}

export interface RecentActivity {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  category: string;
  timestamp: Date;
}

export interface DashboardStats {
  /** Sum of payments received in the current calendar month (UTC) */
  monthlyRevenue: number;
  /** Clients who have at least one pending or in-progress job */
  activeClientsCount: number;
  outstandingInvoices: OutstandingInvoices;
  /** Placeholder — 0 until the reviews module is built */
  reviewCount: number;
  recentActivity: RecentActivity[];
  topClients: TopClient[];
}

/* ─── Raw repository return shapes ──────────────────────────────────────── */

export interface RawTrafficRow {
  date: string;
  pageViews: number;
  visitors: number;
}

export interface RawTopPage {
  page: string;
  views: number;
}

export interface RawRevenueRow {
  month: string;
  revenue: number;
  count: number;
}

export interface RawJobStatusRow {
  status: string;
  count: number;
}

export interface RawTopClient {
  clientId: Types.ObjectId;
  name: string;
  email: string;
  totalSpent: number;
}

export interface RawActivityLog {
  _id: Types.ObjectId;
  actorName: string;
  actorRole: string;
  action: string;
  category: string;
  timestamp: Date;
  createdAt?: Date;
}

import type { Types } from 'mongoose';
