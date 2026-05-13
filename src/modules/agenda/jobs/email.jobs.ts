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

  agenda.define(JOBS.EMAIL_EMPLOYEE_INVITATION, async (job: Job) => {
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
  });

  agenda.define(JOBS.EMAIL_TASK_ASSIGNED, async (job: Job) => {
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
  });

  agenda.define(JOBS.EMAIL_TASK_UPDATED_ASSIGNEE, async (job: Job) => {
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
  });

  agenda.define(JOBS.EMAIL_TASK_UPDATED_ACTOR, async (job: Job) => {
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
  });

  agenda.define(JOBS.EMAIL_TASK_OVERDUE, async (job: Job) => {
    const { to, assigneeName, taskTitle, dueDate } = job.attrs
      .data as TaskOverdueJobData;

    await emailService.send({
      to,
      name: assigneeName,
      subject: 'Task overdue — Servix OS',
      html: taskOverdueTemplate(assigneeName, taskTitle, dueDate),
    });
  });

  agenda.define(JOBS.EMAIL_TEAM_ANNOUNCEMENT, async (job: Job) => {
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
  });
}
