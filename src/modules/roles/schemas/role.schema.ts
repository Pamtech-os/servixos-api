import { index, modelOptions, prop, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum DefaultRole {
  OWNER = 'Owner',
  MANAGER = 'Manager',
  EMPLOYEE = 'Employee',
}

export const ALL_PERMISSIONS = [
  'dashboard.view',
  'clients.view',
  'clients.create',
  'clients.edit',
  'clients.delete',
  'invoices.view',
  'invoices.create',
  'invoices.edit',
  'invoices.delete',
  'jobs.view',
  'jobs.create',
  'jobs.edit',
  'jobs.delete',
  'contracts.view',
  'contracts.create',
  'contracts.edit',
  'contracts.delete',
  'roles.view',
  'roles.create',
  'roles.edit',
  'roles.delete',
  'payments.view',
  'payments.create',
  'payments.edit',
  'payments.delete',
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'requests.view',
  'requests.create',
  'requests.edit',
  'requests.delete',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'tasks.delete',
  'analytics.view',
  'settings.view',
  'settings.edit',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const MANAGER_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'clients.view',
  'clients.create',
  'clients.edit',
  'invoices.view',
  'invoices.create',
  'invoices.edit',
  'jobs.view',
  'jobs.create',
  'jobs.edit',
  'contracts.view',
  'contracts.create',
  'contracts.edit',
  'payments.view',
  'payments.create',
  'payments.edit',
  'employees.view',
  'employees.create',
  'employees.edit',
  'requests.view',
  'requests.create',
  'requests.edit',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'analytics.view',
  'settings.view',
];

const EMPLOYEE_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'clients.view',
  'jobs.view',
  'jobs.edit',
  'contracts.view',
  'payments.view',
  'requests.view',
  'tasks.view',
];

export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRole, Permission[]> = {
  [DefaultRole.OWNER]: [...ALL_PERMISSIONS],
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
  permissions: Permission[];

  /** System roles cannot be deleted and are seeded on business creation */
  @prop({ default: false })
  isSystem: boolean;

  /**
   * Immutable marker for the seeded Owner role.
   * Used to enforce: owner-role permissions are not editable.
   */
  @prop({ default: false })
  isOwnerRole?: boolean;
}
