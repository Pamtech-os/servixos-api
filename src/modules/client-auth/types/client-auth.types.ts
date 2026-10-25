export interface ClientSessionUserData {
  id: string;
  clientId: string;
  name: string;
  email: string;
  businessId: string;
  timezone: string;
  mustChangePassword: boolean;
}

export interface ClientLoginData {
  accessToken: string;
  refreshToken: string;
  user: ClientSessionUserData;
}

export interface ClientTokenData {
  accessToken: string;
  refreshToken?: string;
}
