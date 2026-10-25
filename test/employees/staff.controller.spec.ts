import { NotFoundException } from '@nestjs/common';
import { STAFF_MESSAGES } from 'src/common/constants/messages/staff.messages';
import { StaffController } from 'src/modules/employees/controllers/staff.controller';
import { EmployeesService } from 'src/modules/employees/services/employees.service';
import { asMock } from 'test/helpers/mock';

type JwtUserLike = {
  businessId: string;
};

describe('StaffController', () => {
  let controller: StaffController;
  let employeesService: {
    listStaff: jest.Mock;
    createStaff: jest.Mock;
    updateStaff: jest.Mock;
    deleteStaff: jest.Mock;
    getStaff: jest.Mock;
    getOnlineStaff: jest.Mock;
    getStaffClockHistory: jest.Mock;
  };

  beforeEach(() => {
    employeesService = {
      listStaff: jest.fn(),
      createStaff: jest.fn(),
      updateStaff: jest.fn(),
      deleteStaff: jest.fn(),
      getStaff: jest.fn(),
      getOnlineStaff: jest.fn(),
      getStaffClockHistory: jest.fn(),
    };

    controller = new StaffController(
      asMock<EmployeesService>(employeesService),
    );
  });

  it('lists staff members with staff response contract', async () => {
    employeesService.listStaff.mockResolvedValue({
      data: [{ _id: 's1', fullName: 'Dispatch Rider' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const result = await controller.listStaff(
      { businessId: 'biz_1' } as JwtUserLike as never,
      { page: 1, limit: 10 },
    );

    expect(employeesService.listStaff).toHaveBeenCalledWith('biz_1', {
      page: 1,
      limit: 10,
    });
    expect(result.message).toBe(STAFF_MESSAGES.SUCCESS.RETRIEVED);
    expect(result.data).toHaveLength(1);
    expect(result.meta).toMatchObject({ page: 1, limit: 10 });
  });

  it('creates staff through the same underlying invite flow', async () => {
    employeesService.createStaff.mockResolvedValue({
      _id: 'staff_1',
      email: 'dispatch@test.local',
    });

    const dto = {
      fullName: 'Dispatch Rider',
      email: 'dispatch@test.local',
      roleId: '665def000000000000000003',
      weeklyHoursTarget: 40,
    };

    const result = await controller.createStaff(
      { businessId: 'biz_1' } as JwtUserLike as never,
      dto as never,
    );

    expect(employeesService.createStaff).toHaveBeenCalledWith('biz_1', dto);
    expect(result.message).toBe(STAFF_MESSAGES.SUCCESS.CREATED);
    expect(result.data).toMatchObject({ _id: 'staff_1' });
  });

  it('throws when service returns an HttpException', async () => {
    employeesService.getStaff.mockResolvedValue(
      new NotFoundException('not found'),
    );

    await expect(
      controller.getStaff(
        { businessId: 'biz_1' } as JwtUserLike as never,
        { id: 'missing' } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
