/**
 * Central permission registry for the entire API.
 *
 * Example:
 *   @Permissions(PERMISSIONS.TASKS_EDIT)
 *   const canViewSchedules = myPermissions.includes(PERMISSIONS.SCHEDULES_VIEW);
 *
 * Keep all permission keys here so controllers, DTO validation, and role seeding
 * stay in sync from one source of truth.
 */
export const PERMISSIONS = {
  // dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // clients
  CLIENTS_VIEW: 'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_EDIT: 'clients.edit',
  CLIENTS_DELETE: 'clients.delete',

  // invoice
  INVOICES_VIEW: 'invoices.view',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_EDIT: 'invoices.edit',
  INVOICES_DELETE: 'invoices.delete',

  // jobs
  JOBS_VIEW: 'jobs.view',
  JOBS_CREATE: 'jobs.create',
  JOBS_EDIT: 'jobs.edit',
  JOBS_DELETE: 'jobs.delete',

  // contracts
  CONTRACTS_VIEW: 'contracts.view',
  CONTRACTS_CREATE: 'contracts.create',
  CONTRACTS_EDIT: 'contracts.edit',
  CONTRACTS_DELETE: 'contracts.delete',

  // roles
  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_EDIT: 'roles.edit',
  ROLES_DELETE: 'roles.delete',

  // payments
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_CREATE: 'payments.create',
  PAYMENTS_EDIT: 'payments.edit',
  PAYMENTS_DELETE: 'payments.delete',

  // employees
  EMPLOYEES_VIEW: 'employees.view',
  EMPLOYEES_CREATE: 'employees.create',
  EMPLOYEES_EDIT: 'employees.edit',
  EMPLOYEES_DELETE: 'employees.delete',

  // requests
  REQUESTS_VIEW: 'requests.view',
  REQUESTS_CREATE: 'requests.create',
  REQUESTS_EDIT: 'requests.edit',
  REQUESTS_DELETE: 'requests.delete',

  // tasks
  TASKS_VIEW: 'tasks.view',
  TASKS_CREATE: 'tasks.create',
  TASKS_EDIT: 'tasks.edit',
  TASKS_DELETE: 'tasks.delete',

  // schedules
  SCHEDULES_VIEW: 'schedules.view',
  SCHEDULES_CREATE: 'schedules.create',
  SCHEDULES_EDIT: 'schedules.edit',
  SCHEDULES_DELETE: 'schedules.delete',

  // analytics
  ANALYTICS_VIEW: 'analytics.view',

  // settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(
  PERMISSIONS,
) as Permission[];

export const MANAGER_DEFAULT_PERMISSIONS: Permission[] = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.CLIENTS_VIEW,
  PERMISSIONS.CLIENTS_CREATE,
  PERMISSIONS.CLIENTS_EDIT,
  PERMISSIONS.INVOICES_VIEW,
  PERMISSIONS.INVOICES_CREATE,
  PERMISSIONS.INVOICES_EDIT,
  PERMISSIONS.JOBS_VIEW,
  PERMISSIONS.JOBS_CREATE,
  PERMISSIONS.JOBS_EDIT,
  PERMISSIONS.CONTRACTS_VIEW,
  PERMISSIONS.CONTRACTS_CREATE,
  PERMISSIONS.CONTRACTS_EDIT,
  PERMISSIONS.PAYMENTS_VIEW,
  PERMISSIONS.PAYMENTS_CREATE,
  PERMISSIONS.PAYMENTS_EDIT,
  PERMISSIONS.EMPLOYEES_VIEW,
  PERMISSIONS.EMPLOYEES_CREATE,
  PERMISSIONS.EMPLOYEES_EDIT,
  PERMISSIONS.REQUESTS_VIEW,
  PERMISSIONS.REQUESTS_CREATE,
  PERMISSIONS.REQUESTS_EDIT,
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.TASKS_CREATE,
  PERMISSIONS.TASKS_EDIT,
  PERMISSIONS.SCHEDULES_VIEW,
  PERMISSIONS.SCHEDULES_CREATE,
  PERMISSIONS.SCHEDULES_EDIT,
  PERMISSIONS.SCHEDULES_DELETE,
  PERMISSIONS.ANALYTICS_VIEW,
  PERMISSIONS.SETTINGS_VIEW,
];

export const EMPLOYEE_DEFAULT_PERMISSIONS: Permission[] = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.CLIENTS_VIEW,
  PERMISSIONS.JOBS_VIEW,
  PERMISSIONS.JOBS_EDIT,
  PERMISSIONS.CONTRACTS_VIEW,
  PERMISSIONS.PAYMENTS_VIEW,
  PERMISSIONS.REQUESTS_VIEW,
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.SCHEDULES_VIEW,
];
