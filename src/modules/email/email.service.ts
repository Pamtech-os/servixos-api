import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailjet from 'node-mailjet';
import { IEmailBody } from './email.types';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Mailjet;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly mailVersion: string;

  constructor(config: ConfigService) {
    this.fromEmail = config.get<string>('MAIL_FROM_ADDRESS')!;
    this.fromName = config.get<string>('MAIL_FROM_NAME')!;
    this.mailVersion = config.get<string>('MAILJET_VERSION')!;

    this.client = new Mailjet({
      apiKey: config.get<string>('MAILJET_API_KEY')!,
      apiSecret: config.get<string>('MAILJET_SECRET_KEY')!,
    });
  }

  async send(body: IEmailBody): Promise<void> {
    const params = {
      Messages: [
        {
          From: {
            Email: this.fromEmail,
            Name: this.fromName,
          },
          To: [
            {
              Email: body.to,
              Name: body.name || 'Recipient',
            },
          ],
          Subject: body.subject,
          HTMLPart: body.html,
        },
      ],
    };

    try {
      await this.client
        .post('send', {
          version: this.mailVersion as `v${number}` | `v${number}.${number}`,
        })
        .request(params);
      this.logger.log(`Email sent to: ${body.to}`);
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${body.to}: ${(err as Error).message}`,
      );
    }
  }
}
