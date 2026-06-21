export interface AuthUserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  businessId: string;
  mustChangePassword: boolean;
  subdomain?: string;
}

export interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: AuthUserData;
}

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
}
