import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService, MAIL_PROVIDER } from './services/email.service';
import { MAIL_PROVIDERS } from 'src/common/constants/email.constants';
import { MailjetProvider } from './providers/mailjet.provider';
import { MailtrapProvider } from './providers/mailtrap.provider';

@Global()
@Module({
  providers: [
    MailjetProvider,
    MailtrapProvider,
    {
      provide: MAIL_PROVIDER,
      useFactory: (
        config: ConfigService,
        mailjet: MailjetProvider,
        mailtrap: MailtrapProvider,
      ) => {
        const provider = config.get<string>('MAIL_PROVIDER', 'mailjet');
        return provider === MAIL_PROVIDERS.MAILTRAP ? mailtrap : mailjet;
      },
      inject: [ConfigService, MailjetProvider, MailtrapProvider],
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
