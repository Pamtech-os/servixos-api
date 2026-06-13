export interface AdminJwtPayload {
  sub: string;
  email: string;
  aud: 'admin';
  purpose?: string;
}

export interface AdminLoginData {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  admin: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

/** Returned when an invited admin logs in — full tokens are withheld pending OTP. */
export interface AdminOtpPendingData {
  requiresOtp: true;
  /** Short-lived JWT (10 min) used only to verify the OTP — carries no session privileges. */
  otpToken: string;
}

export interface AdminTokenData {
  accessToken: string;
}

export interface MonthlyDataPoint {
  label: string;
  value: number;
}

export interface DashboardStats {
  totalUsers: number;
  monthlyRevenue: number;
  activeBusinesses: number;
  revenueHistory: MonthlyDataPoint[];
  growthHistory: MonthlyDataPoint[];
}

export interface RecentActivityEntry {
  action: string;
  category: string;
  actorName: string;
  createdAt: Date;
}
