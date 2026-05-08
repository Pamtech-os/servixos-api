import { Agenda, Job } from 'agenda';
import { EmailService } from '../../email/services/email.service';
import { clientCredentialsTemplate } from '../../email/templates/client-credentials.template';
import { emailVerificationTemplate } from '../../email/templates/email-verification.template';
import { passwordResetTemplate } from '../../email/templates/password-reset.template';
import { welcomeTemplate } from '../../email/templates/welcome.template';
import { JOBS } from 'src/common/constants/agenda.constants';

export interface WelcomeJobData {
  to: string;
  firstName: string;
}

export interface PasswordResetJobData {
  to: string;
  firstName: string;
  otp: string;
}

export interface EmailVerificationJobData {
  to: string;
  firstName: string;
  otp: string;
}

export interface ClientCredentialsJobData {
  to: string;
  firstName: string;
  businessName: string;
  temporaryPassword: string;
}

export function defineEmailJobs(
  agenda: Agenda,
  emailService: EmailService,
  appUrl: string,
  clientUrl: string,
): void {
  agenda.define(JOBS.EMAIL_VERIFICATION, async (job: Job) => {
    const { to, firstName, otp } = job.attrs.data as EmailVerificationJobData;
    await emailService.send({
      to,
      name: firstName,
      subject: 'Verify your email — Servix OS',
      html: emailVerificationTemplate(firstName, otp),
    });
  });

  agenda.define(JOBS.EMAIL_WELCOME, async (job: Job) => {
    const { to, firstName } = job.attrs.data as WelcomeJobData;
    await emailService.send({
      to,
      name: firstName,
      subject: 'Your Servix OS office is ready',
      html: welcomeTemplate(firstName, appUrl),
    });
  });

  agenda.define(JOBS.EMAIL_PASSWORD_RESET, async (job: Job) => {
    const { to, firstName, otp } = job.attrs.data as PasswordResetJobData;
    await emailService.send({
      to,
      name: firstName,
      subject: 'Reset Your Password — Servix OS',
      html: passwordResetTemplate(firstName, otp),
    });
  });

  agenda.define(JOBS.EMAIL_CLIENT_CREDENTIALS, async (job: Job) => {
    const { to, firstName, businessName, temporaryPassword } = job.attrs
      .data as ClientCredentialsJobData;
    const loginUrl = `${clientUrl.replace(/\/$/, '')}/login`;

    await emailService.send({
      to,
      name: firstName,
      subject: 'Your client credentials — Servix OS',
      html: clientCredentialsTemplate(
        firstName,
        businessName,
        temporaryPassword,
        loginUrl,
      ),
    });
  });
}
