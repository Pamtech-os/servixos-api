export const ROLES_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'Invalid role identifier format',
    NAME_REQUIRED: 'Role name is required',
    NAME_INVALID: 'Role name must be a valid string',
    NAME_TOO_LONG: 'Role name must not exceed 60 characters',
    PERMISSIONS_REQUIRED: 'Permissions are required',
    PERMISSIONS_ARRAY: 'Permissions must be an array of strings',
    PERMISSION_INVALID: 'One or more permissions are invalid',
  },
  SUCCESS: {
    CREATED: 'Role created successfully',
    RETRIEVED: 'Roles retrieved successfully',
    FOUND: 'Role retrieved successfully',
    UPDATED: 'Role updated successfully',
    DELETED: 'Role deleted successfully',
    PERMISSIONS_RETRIEVED: 'Permissions retrieved successfully',
  },
  ERROR: {
    NOT_FOUND: 'Requested role was not found',
    NAME_TAKEN: 'Role name is already in use',
    DEFAULT_ROLE: 'System roles are protected and cannot be deleted',
    ROLE_IN_USE: 'Role is assigned to active users and cannot be deleted',
    OWNER_ROLE_PERMISSIONS:
      'Owner role permissions are protected and cannot be modified',
    INVALID_PERMISSION: 'One or more permission values are not allowed',
  },
} as const;
