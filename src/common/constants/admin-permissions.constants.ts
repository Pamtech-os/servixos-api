export const ADMIN_PERMISSIONS = {
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  BUSINESSES_VIEW: 'businesses.view',
  BUSINESSES_MANAGE: 'businesses.manage',
  BILLING_VIEW: 'billing.view',
  BILLING_MANAGE: 'billing.manage',
  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',
  SUPPORT_VIEW: 'support.view',
  SUPPORT_MANAGE: 'support.manage',
  ACTIVITY_LOGS_VIEW: 'activity_logs.view',
  SUBSCRIPTIONS_VIEW: 'subscriptions.view',
} as const;

export type AdminPermission =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] =
  Object.values(ADMIN_PERMISSIONS);

export const ADMIN_PERMISSION_META: Record<
  AdminPermission,
  { label: string; description: string }
> = {
  'users.view': {
    label: 'View Users',
    description: 'View user accounts and profiles',
  },
  'users.manage': {
    label: 'Manage Users',
    description: 'Create, edit, suspend user accounts',
  },
  'businesses.view': {
    label: 'View Businesses',
    description: 'View business accounts',
  },
  'businesses.manage': {
    label: 'Manage Businesses',
    description: 'Edit, suspend, approve businesses',
  },
  'billing.view': {
    label: 'View Billing',
    description: 'View invoices and payment info',
  },
  'billing.manage': {
    label: 'Manage Billing',
    description: 'Manage invoices and payment settings',
  },
  'roles.view': {
    label: 'View Roles',
    description: 'View admin roles and permissions',
  },
  'roles.manage': {
    label: 'Manage Roles',
    description: 'Create, edit, and delete admin roles',
  },
  'support.view': {
    label: 'View Support',
    description: 'View support tickets',
  },
  'support.manage': {
    label: 'Manage Support',
    description: 'Assign, reply, and resolve support tickets',
  },
  'activity_logs.view': {
    label: 'View Activity Logs',
    description: 'View cross-business activity logs',
  },
  'subscriptions.view': {
    label: 'View Subscriptions',
    description: 'View subscription analytics',
  },
};

// Default role permission sets used when seeding
export const DEFAULT_ROLE_PERMISSIONS = {
  Admin: ALL_ADMIN_PERMISSIONS,
  Manager: [
    ADMIN_PERMISSIONS.USERS_VIEW,
    ADMIN_PERMISSIONS.USERS_MANAGE,
    ADMIN_PERMISSIONS.BUSINESSES_VIEW,
    ADMIN_PERMISSIONS.BUSINESSES_MANAGE,
    ADMIN_PERMISSIONS.BILLING_VIEW,
    ADMIN_PERMISSIONS.SUPPORT_VIEW,
    ADMIN_PERMISSIONS.ACTIVITY_LOGS_VIEW,
  ],
  Support: [
    ADMIN_PERMISSIONS.USERS_VIEW,
    ADMIN_PERMISSIONS.BUSINESSES_VIEW,
    ADMIN_PERMISSIONS.SUPPORT_VIEW,
    ADMIN_PERMISSIONS.SUPPORT_MANAGE,
  ],
  Billing: [
    ADMIN_PERMISSIONS.USERS_VIEW,
    ADMIN_PERMISSIONS.BUSINESSES_VIEW,
    ADMIN_PERMISSIONS.BILLING_VIEW,
    ADMIN_PERMISSIONS.BILLING_MANAGE,
    ADMIN_PERMISSIONS.SUBSCRIPTIONS_VIEW,
  ],
} as const;
