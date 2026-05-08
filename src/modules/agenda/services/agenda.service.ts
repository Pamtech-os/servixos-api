import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agenda, Job } from 'agenda';
import { EmailService } from '../../email/services/email.service';
import { AgendaJobName } from 'src/common/constants/agenda.constants';
import { defineEmailJobs } from '../jobs/email.jobs';

@Injectable()
export class AgendaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgendaService.name);
  private readonly agenda: Agenda;
  private readonly appUrl: string;
  private readonly clientUrl: string;

  constructor(
    config: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.appUrl = config.get<string>('APP_URL') || 'http://localhost:3000';
    this.clientUrl =
      config.get<string>('CLIENT_URL') || 'http://localhost:3000';
    this.agenda = new Agenda({
      db: {
        address: config.get<string>('DATABASE_URL')!,
        collection: 'agenda_jobs',
      },
      processEvery: '20 seconds',
      defaultConcurrency: 5,
    });
  }

  async onModuleInit(): Promise<void> {
    defineEmailJobs(
      this.agenda,
      this.emailService,
      this.appUrl,
      this.clientUrl,
    );
    await this.agenda.start();
    this.logger.log('Agenda started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.agenda.stop();
    this.logger.log('Agenda stopped');
  }

  async now<T extends object>(jobName: AgendaJobName, data: T): Promise<void> {
    await this.agenda.now(jobName, data);
  }

  async schedule<T extends object>(
    when: string | Date,
    jobName: AgendaJobName,
    data: T,
  ): Promise<void> {
    await this.agenda.schedule(when, jobName, data);
  }

  async every<T extends object>(
    interval: string,
    jobName: AgendaJobName,
    data?: T,
  ): Promise<void> {
    await this.agenda.every(interval, jobName, data);
  }

  define(jobName: AgendaJobName, processor: (job: Job) => Promise<void>): void {
    this.agenda.define(jobName, processor);
  }
}
