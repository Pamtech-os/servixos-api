import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailjet from 'node-mailjet';
import { IEmailBody } from '../email.types';
import { IMailProvider } from './mail-provider.interface';

@Injectable()
export class MailjetProvider implements IMailProvider {
  private readonly logger = new Logger(MailjetProvider.name);
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
            Email: body.from ?? this.fromEmail,
            Name: this.fromName,
          },
          To: [{ Email: body.to, Name: body.name || 'Recipient' }],
          ...(body.cc?.length && {
            Cc: body.cc.map((email) => ({ Email: email })),
          }),
          ...(body.replyTo && { ReplyTo: { Email: body.replyTo } }),
          Subject: body.subject,
          HTMLPart: body.html,
          ...(body.attachments?.length && {
            Attachments: body.attachments.map((a) => ({
              ContentType: a.ContentType,
              Filename: a.Filename,
              Base64Content: a.Base64Content,
            })),
          }),
        },
      ],
    };

    try {
      await this.client
        .post('send', {
          version: this.mailVersion as `v${number}` | `v${number}.${number}`,
        })
        .request(params);
      this.logger.log(`[Mailjet] Email sent to: ${body.to}`);
    } catch (err) {
      this.logger.error(
        `[Mailjet] Failed to send email to ${body.to}: ${(err as Error).message}`,
      );
    }
  }
}
