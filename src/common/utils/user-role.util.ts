import { UserRole } from 'src/modules/users/schemas/user.schema';

/**
 * Internal staff users include both legacy `employee` and new `staff` role keys.
 * This keeps existing tokens/data working while enabling gradual migration.
 */
export function isInternalStaffRole(
  role: UserRole | string | undefined | null,
): boolean {
  return role === UserRole.EMPLOYEE || role === UserRole.STAFF;
}
