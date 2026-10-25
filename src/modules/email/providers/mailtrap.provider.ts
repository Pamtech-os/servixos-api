import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailtrapClient } from 'mailtrap';
import { IEmailBody } from '../types/email.types';
import { IMailProvider } from './mail-provider.interface';

@Injectable()
export class MailtrapProvider implements IMailProvider {
  private readonly logger = new Logger(MailtrapProvider.name);
  private readonly client: MailtrapClient;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(config: ConfigService) {
    this.fromEmail = config.get<string>('MAIL_FROM_ADDRESS')!;
    this.fromName = config.get<string>('MAIL_FROM_NAME')!;

    this.client = new MailtrapClient({
      token: config.get<string>('MAILTRAP_TOKEN')!,
    });
  }

  async send(body: IEmailBody): Promise<void> {
    try {
      await this.client.send({
        from: { email: body.from ?? this.fromEmail, name: this.fromName },
        to: [{ email: body.to, name: body.name || 'Recipient' }],
        subject: body.subject,
        html: body.html,
        ...(body.cc?.length && {
          cc: body.cc.map((email) => ({ email })),
        }),
        ...(body.replyTo && { reply_to: { email: body.replyTo } }),
        ...(body.attachments?.length && {
          attachments: body.attachments.map((a) => ({
            filename: a.Filename,
            type: a.ContentType,
            content: a.Base64Content,
            disposition: 'attachment',
          })),
        }),
      });
      this.logger.log(`[Mailtrap] Email sent to: ${body.to}`);
    } catch (err) {
      this.logger.error(
        `[Mailtrap] Failed to send email to ${body.to}: ${(err as Error).message}`,
      );
    }
  }
}
