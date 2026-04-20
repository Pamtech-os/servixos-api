export const ROLES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Role created successfully',
    RETRIEVED: 'Roles retrieved successfully',
    FOUND: 'Role retrieved successfully',
    UPDATED: 'Role updated successfully',
    DELETED: 'Role deleted successfully',
    PERMISSIONS_RETRIEVED: 'Permissions retrieved successfully',
  },
  ERROR: {
    NOT_FOUND: 'Role not found',
    NAME_TAKEN: 'A role with this name already exists',
    DEFAULT_ROLE: 'Default roles cannot be deleted',
    INVALID_PERMISSION: 'One or more permissions are invalid',
  },
} as const;
