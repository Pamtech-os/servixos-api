import { prop, index, modelOptions, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum DefaultRole {
  OWNER = 'Owner',
  MANAGER = 'Manager',
  EMPLOYEE = 'Employee',
}

export const PERMISSIONS = {
  CLIENTS_VIEW: 'clients:view',
  CLIENTS_CREATE: 'clients:create',
  CLIENTS_UPDATE: 'clients:update',
  CLIENTS_DELETE: 'clients:delete',
  JOBS_VIEW: 'jobs:view',
  JOBS_CREATE: 'jobs:create',
  JOBS_UPDATE: 'jobs:update',
  JOBS_DELETE: 'jobs:delete',
  INVOICES_VIEW: 'invoices:view',
  INVOICES_CREATE: 'invoices:create',
  INVOICES_UPDATE: 'invoices:update',
  INVOICES_DELETE: 'invoices:delete',
  EMPLOYEES_VIEW: 'employees:view',
  EMPLOYEES_MANAGE: 'employees:manage',
  SCHEDULE_VIEW: 'schedule:view',
  SCHEDULE_MANAGE: 'schedule:manage',
  TIME_CLOCK: 'time:clock',
  TIME_VIEW_ALL: 'time:view_all',
  TASKS_VIEW: 'tasks:view',
  TASKS_MANAGE: 'tasks:manage',
  ANALYTICS_VIEW: 'analytics:view',
  WEBSITE_MANAGE: 'website:manage',
  ROLES_MANAGE: 'roles:manage',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',
  FILES_VIEW: 'files:view',
  FILES_MANAGE: 'files:manage',
  CONTRACTS_VIEW: 'contracts:view',
  CONTRACTS_MANAGE: 'contracts:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

const MANAGER_PERMISSIONS: Permission[] = [
  PERMISSIONS.CLIENTS_VIEW,
  PERMISSIONS.CLIENTS_CREATE,
  PERMISSIONS.CLIENTS_UPDATE,
  PERMISSIONS.CLIENTS_DELETE,
  PERMISSIONS.JOBS_VIEW,
  PERMISSIONS.JOBS_CREATE,
  PERMISSIONS.JOBS_UPDATE,
  PERMISSIONS.JOBS_DELETE,
  PERMISSIONS.INVOICES_VIEW,
  PERMISSIONS.INVOICES_CREATE,
  PERMISSIONS.INVOICES_UPDATE,
  PERMISSIONS.EMPLOYEES_VIEW,
  PERMISSIONS.SCHEDULE_VIEW,
  PERMISSIONS.SCHEDULE_MANAGE,
  PERMISSIONS.TIME_CLOCK,
  PERMISSIONS.TIME_VIEW_ALL,
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.TASKS_MANAGE,
  PERMISSIONS.ANALYTICS_VIEW,
  PERMISSIONS.WEBSITE_MANAGE,
  PERMISSIONS.FILES_VIEW,
  PERMISSIONS.FILES_MANAGE,
  PERMISSIONS.CONTRACTS_VIEW,
  PERMISSIONS.CONTRACTS_MANAGE,
  PERMISSIONS.SETTINGS_VIEW,
];

const EMPLOYEE_PERMISSIONS: Permission[] = [
  PERMISSIONS.CLIENTS_VIEW,
  PERMISSIONS.JOBS_VIEW,
  PERMISSIONS.JOBS_UPDATE,
  PERMISSIONS.SCHEDULE_VIEW,
  PERMISSIONS.TIME_CLOCK,
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.FILES_VIEW,
  PERMISSIONS.CONTRACTS_VIEW,
];

export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRole, Permission[]> = {
  [DefaultRole.OWNER]: ALL_PERMISSIONS,
  [DefaultRole.MANAGER]: MANAGER_PERMISSIONS,
  [DefaultRole.EMPLOYEE]: EMPLOYEE_PERMISSIONS,
};

@index({ businessId: 1, name: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'roles', timestamps: true } })
export class Role {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  permissions: string[];

  /** System roles cannot be deleted and are seeded on business creation */
  @prop({ default: false })
  isSystem: boolean;
}
