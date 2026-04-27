import { Inject, Injectable } from '@nestjs/common';
import { IEmailBody } from './email.types';
import type { IMailProvider } from './providers/mail-provider.interface';

export const MAIL_PROVIDER = 'MAIL_PROVIDER';

@Injectable()
export class EmailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: IMailProvider,
  ) {}

  async send(body: IEmailBody): Promise<void> {
    return this.provider.send(body);
  }
}
