import { Request } from 'express';

export interface ClientRequestUser {
  userId: string;
  businessId: string;
  clientId: string;
  email: string;
}

export interface ClientRequest extends Request {
  clientUser?: ClientRequestUser;
}
