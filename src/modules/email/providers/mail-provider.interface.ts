import { IEmailBody } from '../types/email.types';

export interface IMailProvider {
  send(body: IEmailBody): Promise<void>;
}
