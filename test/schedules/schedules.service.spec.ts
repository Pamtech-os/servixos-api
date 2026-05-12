import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { SchedulesService } from 'src/modules/schedules/services/schedules.service';
import { ShiftsRepository } from 'src/modules/schedules/repositories/shifts.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';

const BUSINESS_ID = new Types.ObjectId().toString();
const EMPLOYEE_ID = new Types.ObjectId().toString();

describe('SchedulesService', () => {
  let service: SchedulesService;

  const shiftsRepository = {
    findWeekShifts: jest.fn(),
    findById: jest.fn(),
    findOverlappingShift: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    softDelete: jest.fn(),
  };

  const employeesRepository = {
    findById: jest.fn(),
  };

  const businessRepository = {
    findById: jest.fn(),
  };

  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SchedulesService(
      shiftsRepository as unknown as ShiftsRepository,
      employeesRepository as unknown as EmployeesRepository,
      businessRepository as unknown as BusinessRepository,
      redisService as unknown as RedisService,
    );
  });

  it('returns conflict when employee has overlapping shift', async () => {
    employeesRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(EMPLOYEE_ID),
    });
    shiftsRepository.findOverlappingShift.mockResolvedValue({
      _id: new Types.ObjectId(),
    });

    const result = await service.createShift(BUSINESS_ID, {
      employeeId: EMPLOYEE_ID,
      shiftDate: '2026-04-14',
      startTime: '09:00',
      endTime: '17:00',
      notes: 'Morning crew',
    });

    expect(result).toBeInstanceOf(ConflictException);
  });

  it('returns cached week schedules when available', async () => {
    const weekStartDate = '2026-04-13T00:00:00.000Z';
    redisService.get.mockResolvedValue(
      JSON.stringify([
        {
          _id: new Types.ObjectId().toString(),
          employeeId: EMPLOYEE_ID,
          weekStartDate,
        },
      ]),
    );

    const result = await service.listSchedules(BUSINESS_ID, {
      weekStartDate,
      employeeId: EMPLOYEE_ID,
    });

    expect(result instanceof Error).toBe(false);
    expect((result as { data: unknown[] }).data).toHaveLength(1);
    expect(shiftsRepository.findWeekShifts).not.toHaveBeenCalled();
  });
});
