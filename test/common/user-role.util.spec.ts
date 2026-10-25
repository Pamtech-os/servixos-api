import { isInternalStaffRole } from 'src/common/utils/user-role.util';
import { UserRole } from 'src/modules/users/schemas/user.schema';

describe('isInternalStaffRole', () => {
  it('returns true for employee and staff roles', () => {
    expect(isInternalStaffRole(UserRole.EMPLOYEE)).toBe(true);
    expect(isInternalStaffRole(UserRole.STAFF)).toBe(true);
  });

  it('returns false for owner and client roles', () => {
    expect(isInternalStaffRole(UserRole.OWNER)).toBe(false);
    expect(isInternalStaffRole(UserRole.CLIENT)).toBe(false);
  });

  it('returns false for nullish values', () => {
    expect(isInternalStaffRole(undefined)).toBe(false);
    expect(isInternalStaffRole(null)).toBe(false);
  });
});
