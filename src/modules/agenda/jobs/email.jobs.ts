import { Agenda, Job } from 'agenda';
import { EmailService } from '../../email/services/email.service';
import { clientCredentialsTemplate } from '../../email/templates/client-credentials.template';
import { employeeInvitationTemplate } from '../../email/templates/employee-invitation.template';
import { emailVerificationTemplate } from '../../email/templates/email-verification.template';
import { passwordResetTemplate } from '../../email/templates/password-reset.template';
import { welcomeTemplate } from '../../email/templates/welcome.template';
import {
  taskAssignedTemplate,
  taskUpdatedActorTemplate,
  taskUpdatedAssigneeTemplate,
} from '../../email/templates/task-notification.template';
import { taskOverdueTemplate } from '../../email/templates/task-overdue.template';
import { teamAnnouncementTemplate } from '../../email/templates/team-announcement.template';
import {
  adminCustomEmailTemplate,
  adminInvitationTemplate,
} from '../../email/templates/admin-custom-email.template';
import { adminOtpTemplate } from '../../email/templates/admin-otp.template';
import { newServiceRequestTemplate } from '../../email/templates/new-service-request.template';
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

export interface EmployeeInvitationJobData {
  to: string;
  firstName: string;
  businessName: string;
  temporaryPassword: string;
}

export interface TaskAssignedJobData {
  to: string;
  assigneeName: string;
  taskTitle: string;
  actorName: string;
  priority?: string;
  dueDate?: string;
}

export interface TaskUpdatedAssigneeJobData {
  to: string;
  assigneeName: string;
  taskTitle: string;
  actorName: string;
  changes?: string[];
}

export interface TaskUpdatedActorJobData {
  to: string;
  actorName: string;
  taskTitle: string;
  assigneeName: string;
  changes?: string[];
}

export interface TaskOverdueJobData {
  to: string;
  assigneeName: string;
  taskTitle: string;
  dueDate: string;
}

export interface TeamAnnouncementJobData {
  to: string;
  recipientName: string;
  businessName: string;
  title: string;
  description: string;
  authorName: string;
  createdAtLabel: string;
}

export interface AdminCustomEmailJobData {
  to: string;
  recipientName: string;
  subject: string;
  message: string;
}

export interface AdminInvitationJobData {
  to: string;
  firstName: string;
  temporaryPassword: string;
  loginUrl: string;
}

export interface AdminOtpJobData {
  to: string;
  firstName: string;
  otp: string;
}

export interface NewServiceRequestJobData {
  to: string;
  firstName: string;
  businessName: string;
  clientName: string;
  service: string;
  requestedDate: string;
  message?: string;
}

export function defineEmailJobs(
  agenda: Agenda,
  emailService: EmailService,
  appUrl: string,
  clientUrl: string,
): void {
  agenda.define(
    JOBS.EMAIL_VERIFICATION,
    { concurrency: 10 },
    async (job: Job) => {
      const { to, firstName, otp } = job.attrs.data as EmailVerificationJobData;
      await emailService.send({
        to,
        name: firstName,
        subject: 'Verify your email — Servix OS',
        html: emailVerificationTemplate(firstName, otp),
      });
    },
  );

  agenda.define(JOBS.EMAIL_WELCOME, { concurrency: 5 }, async (job: Job) => {
    const { to, firstName } = job.attrs.data as WelcomeJobData;
    await emailService.send({
      to,
      name: firstName,
      subject: 'Your Servix OS office is ready',
      html: welcomeTemplate(firstName, appUrl),
    });
  });

  agenda.define(
    JOBS.EMAIL_PASSWORD_RESET,
    { concurrency: 10 },
    async (job: Job) => {
      const { to, firstName, otp } = job.attrs.data as PasswordResetJobData;
      await emailService.send({
        to,
        name: firstName,
        subject: 'Reset Your Password — Servix OS',
        html: passwordResetTemplate(firstName, otp),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_CLIENT_CREDENTIALS,
    { concurrency: 5 },
    async (job: Job) => {
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
    },
  );

  agenda.define(
    JOBS.EMAIL_EMPLOYEE_INVITATION,
    { concurrency: 5 },
    async (job: Job) => {
      const { to, firstName, businessName, temporaryPassword } = job.attrs
        .data as EmployeeInvitationJobData;
      const loginUrl = `${appUrl.replace(/\/$/, '')}/login`;

      await emailService.send({
        to,
        name: firstName,
        subject: 'Your employee invitation - Servix OS',
        html: employeeInvitationTemplate(
          firstName,
          businessName,
          temporaryPassword,
          loginUrl,
        ),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_TASK_ASSIGNED,
    { concurrency: 10 },
    async (job: Job) => {
      const { to, assigneeName, taskTitle, actorName, priority, dueDate } = job
        .attrs.data as TaskAssignedJobData;

      await emailService.send({
        to,
        name: assigneeName,
        subject: 'New task assigned — Servix OS',
        html: taskAssignedTemplate(
          assigneeName,
          taskTitle,
          actorName,
          priority,
          dueDate,
        ),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_TASK_UPDATED_ASSIGNEE,
    { concurrency: 10 },
    async (job: Job) => {
      const { to, assigneeName, taskTitle, actorName, changes } = job.attrs
        .data as TaskUpdatedAssigneeJobData;

      await emailService.send({
        to,
        name: assigneeName,
        subject: 'Task updated — Servix OS',
        html: taskUpdatedAssigneeTemplate(
          assigneeName,
          taskTitle,
          actorName,
          changes,
        ),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_TASK_UPDATED_ACTOR,
    { concurrency: 10 },
    async (job: Job) => {
      const { to, actorName, taskTitle, assigneeName, changes } = job.attrs
        .data as TaskUpdatedActorJobData;

      await emailService.send({
        to,
        name: actorName,
        subject: 'Task updated by assignee — Servix OS',
        html: taskUpdatedActorTemplate(
          actorName,
          taskTitle,
          assigneeName,
          changes,
        ),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_TASK_OVERDUE,
    { concurrency: 10 },
    async (job: Job) => {
      const { to, assigneeName, taskTitle, dueDate } = job.attrs
        .data as TaskOverdueJobData;

      await emailService.send({
        to,
        name: assigneeName,
        subject: 'Task overdue — Servix OS',
        html: taskOverdueTemplate(assigneeName, taskTitle, dueDate),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_ADMIN_CUSTOM,
    { concurrency: 5 },
    async (job: Job) => {
      const { to, recipientName, subject, message } = job.attrs
        .data as AdminCustomEmailJobData;
      await emailService.send({
        to,
        name: recipientName,
        subject,
        html: adminCustomEmailTemplate(recipientName, subject, message),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_ADMIN_INVITATION,
    { concurrency: 3 },
    async (job: Job) => {
      const { to, firstName, temporaryPassword, loginUrl } = job.attrs
        .data as AdminInvitationJobData;
      await emailService.send({
        to,
        name: firstName,
        subject: 'Welcome to Servix OS — Your Account is Ready',
        html: adminInvitationTemplate(firstName, temporaryPassword, loginUrl),
      });
    },
  );

  agenda.define(JOBS.EMAIL_ADMIN_OTP, { concurrency: 5 }, async (job: Job) => {
    const { to, firstName, otp } = job.attrs.data as AdminOtpJobData;
    await emailService.send({
      to,
      name: firstName,
      subject: 'Your Admin Login OTP — Servix OS',
      html: adminOtpTemplate(firstName, otp),
    });
  });

  agenda.define(
    JOBS.EMAIL_NEW_SERVICE_REQUEST,
    { concurrency: 10 },
    async (job: Job) => {
      const {
        to,
        firstName,
        businessName,
        clientName,
        service,
        requestedDate,
        message,
      } = job.attrs.data as NewServiceRequestJobData;
      await emailService.send({
        to,
        name: firstName,
        subject: 'New service request — Servix OS',
        html: newServiceRequestTemplate(
          firstName,
          clientName,
          service,
          requestedDate,
          businessName,
          message,
        ),
      });
    },
  );

  agenda.define(
    JOBS.EMAIL_TEAM_ANNOUNCEMENT,
    { concurrency: 10 },
    async (job: Job) => {
      const {
        to,
        recipientName,
        businessName,
        title,
        description,
        authorName,
        createdAtLabel,
      } = job.attrs.data as TeamAnnouncementJobData;

      await emailService.send({
        to,
        name: recipientName,
        subject: 'New team announcement — Servix OS',
        html: teamAnnouncementTemplate(
          recipientName,
          title,
          description,
          authorName,
          businessName,
          createdAtLabel,
        ),
      });
    },
  );
}
