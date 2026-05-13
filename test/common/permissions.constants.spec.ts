import {
  ALL_PERMISSIONS,
  EMPLOYEE_DEFAULT_PERMISSIONS,
  MANAGER_DEFAULT_PERMISSIONS,
  PERMISSIONS,
} from 'src/common/constants/permissions.constants';

describe('permissions.constants', () => {
  it('includes dedicated schedules permissions in the global list', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        PERMISSIONS.SCHEDULES_VIEW,
        PERMISSIONS.SCHEDULES_CREATE,
        PERMISSIONS.SCHEDULES_EDIT,
        PERMISSIONS.SCHEDULES_DELETE,
      ]),
    );
  });

  it('maps default role schedule permissions correctly', () => {
    expect(MANAGER_DEFAULT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        PERMISSIONS.SCHEDULES_VIEW,
        PERMISSIONS.SCHEDULES_CREATE,
        PERMISSIONS.SCHEDULES_EDIT,
        PERMISSIONS.SCHEDULES_DELETE,
      ]),
    );

    expect(EMPLOYEE_DEFAULT_PERMISSIONS).toContain(PERMISSIONS.SCHEDULES_VIEW);
    expect(EMPLOYEE_DEFAULT_PERMISSIONS).not.toContain(
      PERMISSIONS.SCHEDULES_CREATE,
    );
    expect(EMPLOYEE_DEFAULT_PERMISSIONS).not.toContain(
      PERMISSIONS.SCHEDULES_EDIT,
    );
    expect(EMPLOYEE_DEFAULT_PERMISSIONS).not.toContain(
      PERMISSIONS.SCHEDULES_DELETE,
    );
  });

  it('keeps ALL_PERMISSIONS unique', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });
});
