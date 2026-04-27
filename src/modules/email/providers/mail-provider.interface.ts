import { IEmailBody } from '../email.types';

export interface IMailProvider {
  send(body: IEmailBody): Promise<void>;
}
