import { Socket } from 'socket.io';

export interface AuthenticatedSocketData {
  userId: string;
  businessId: string;
  clientId: string;
}

export interface AuthenticatedSocket extends Socket {
  data: AuthenticatedSocketData;
}
