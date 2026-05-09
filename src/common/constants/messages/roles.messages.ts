export const ROLES_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'Role ID must be a valid ObjectId',
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
    NOT_FOUND: 'Role not found',
    NAME_TAKEN: 'A role with this name already exists',
    DEFAULT_ROLE: 'Default roles cannot be deleted',
    ROLE_IN_USE: 'Role cannot be deleted while users are still assigned to it',
    OWNER_ROLE_PERMISSIONS: 'Permissions of the owner role cannot be modified',
    INVALID_PERMISSION: 'One or more permissions are invalid',
  },
} as const;
