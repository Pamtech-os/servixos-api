import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TIME_TRACKING_MESSAGES } from 'src/common/constants/messages/time-tracking.messages';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClockRecordsRepository } from 'src/modules/employees/repositories/clock-records.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { ClockStatus } from 'src/modules/employees/schemas/clock-record.schema';
import { ClockService } from 'src/modules/employees/services/clock.service';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { UserRole } from 'src/modules/users/schemas/user.schema';

const BUSINESS_ID = '664abc123456789012345678';
const EMPLOYEE_ID = '665def000000000000000001';
const OWNER_USER_ID = '665def000000000000000009';
const EMPLOYEE_USER_ID = '665def000000000000000010';

const baseEmployee = {
  _id: new Types.ObjectId(EMPLOYEE_ID),
  businessId: new Types.ObjectId(BUSINESS_ID),
  fullName: 'Sarah Connor',
  email: 'sarah@business.com',
  roleId: new Types.ObjectId(),
  weeklyHoursTarget: 40,
};

describe('ClockService', () => {
  let service: ClockService;

  let employeesRepository: {
    findById: jest.Mock;
    findByUserId: jest.Mock;
  };

  let clockRecordsRepository: {
    findActive: jest.Mock;
    create: jest.Mock;
    clockOutActive: jest.Mock;
    startBreak: jest.Mock;
    endBreak: jest.Mock;
  };

  let businessRepository: {
    findById: jest.Mock;
  };

  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
  };

  const ownerActor: JwtUser = {
    sub: OWNER_USER_ID,
    businessId: BUSINESS_ID,
    userRole: UserRole.OWNER,
    pinVerified: true,
  };

  const employeeActor: JwtUser = {
    sub: EMPLOYEE_USER_ID,
    businessId: BUSINESS_ID,
    userRole: UserRole.EMPLOYEE,
    pinVerified: true,
  };

  beforeEach(() => {
    employeesRepository = {
      findById: jest.fn().mockResolvedValue(baseEmployee),
      findByUserId: jest.fn().mockResolvedValue(baseEmployee),
    };

    clockRecordsRepository = {
      findActive: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        clockInAt: new Date('2026-04-14T08:00:00.000Z'),
      }),
      clockOutActive: jest.fn(),
      startBreak: jest.fn(),
      endBreak: jest.fn(),
    };

    businessRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(BUSINESS_ID),
        timezone: 'America/New_York',
      }),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    service = new ClockService(
      employeesRepository as unknown as EmployeesRepository,
      clockRecordsRepository as unknown as ClockRecordsRepository,
      businessRepository as unknown as BusinessRepository,
      redisService as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('clockIn', () => {
    it('creates clock record when employee is not currently clocked in', async () => {
      const result = await service.clockIn(ownerActor, BUSINESS_ID, {
        employeeId: EMPLOYEE_ID,
      });

      expect(result).not.toBeInstanceOf(ConflictException);
      expect(clockRecordsRepository.create).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalled();
    });

    it('returns conflict when employee is already clocked in', async () => {
      clockRecordsRepository.findActive.mockResolvedValue({
        _id: new Types.ObjectId(),
        employeeId: baseEmployee._id,
        businessId: baseEmployee.businessId,
        clockInAt: new Date(),
      });

      const result = await service.clockIn(ownerActor, BUSINESS_ID, {
        employeeId: EMPLOYEE_ID,
      });

      expect(result).toBeInstanceOf(ConflictException);
      expect((result as ConflictException).message).toBe(
        TIME_TRACKING_MESSAGES.ERROR.ALREADY_CLOCKED_IN,
      );
    });
  });

  describe('access control', () => {
    it('returns forbidden when employee tries clock action for another employee', async () => {
      employeesRepository.findByUserId.mockResolvedValue({
        ...baseEmployee,
        _id: new Types.ObjectId(),
      });

      const result = await service.clockIn(employeeActor, BUSINESS_ID, {
        employeeId: EMPLOYEE_ID,
      });

      expect(result).toBeInstanceOf(ForbiddenException);
    });

    it('returns not found when target employee does not exist', async () => {
      employeesRepository.findById.mockResolvedValue(null);

      const result = await service.clockIn(ownerActor, BUSINESS_ID, {
        employeeId: EMPLOYEE_ID,
      });

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        TIME_TRACKING_MESSAGES.ERROR.EMPLOYEE_NOT_FOUND,
      );
    });
  });

  describe('endBreak', () => {
    it('computes break duration from breakStartedAt and ignores client duration', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-04-14T09:30:45.000Z'));

      clockRecordsRepository.findActive.mockResolvedValue({
        _id: new Types.ObjectId(),
        employeeId: baseEmployee._id,
        businessId: baseEmployee.businessId,
        clockInAt: new Date('2026-04-14T08:00:00.000Z'),
        breakStartedAt: new Date('2026-04-14T09:00:00.000Z'),
        breakMinutes: 0,
        status: ClockStatus.ON_BREAK,
        timezone: 'UTC',
      });

      clockRecordsRepository.endBreak.mockResolvedValue({
        _id: new Types.ObjectId(),
        breakMinutes: 30,
      });

      const result = await service.endBreak(ownerActor, BUSINESS_ID, {
        employeeId: EMPLOYEE_ID,
        breakDurationMinutes: 1,
      });

      expect(clockRecordsRepository.endBreak).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        baseEmployee._id,
        30,
      );
      expect((result as { breakMinutes: number }).breakMinutes).toBe(30);
    });

    it('applies a safe minimum of 1 minute when elapsed time is non-positive', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-04-14T09:00:00.000Z'));

      clockRecordsRepository.findActive.mockResolvedValue({
        _id: new Types.ObjectId(),
        employeeId: baseEmployee._id,
        businessId: baseEmployee.businessId,
        clockInAt: new Date('2026-04-14T08:00:00.000Z'),
        breakStartedAt: new Date('2026-04-14T09:05:00.000Z'),
        breakMinutes: 0,
        status: ClockStatus.ON_BREAK,
        timezone: 'UTC',
      });

      clockRecordsRepository.endBreak.mockResolvedValue({
        _id: new Types.ObjectId(),
        breakMinutes: 1,
      });

      await service.endBreak(ownerActor, BUSINESS_ID, {
        employeeId: EMPLOYEE_ID,
      });

      expect(clockRecordsRepository.endBreak).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        baseEmployee._id,
        1,
      );
    });
  });

  describe('getStatus', () => {
    it('returns cached status when available', async () => {
      redisService.get.mockResolvedValueOnce(
        JSON.stringify({
          status: ClockStatus.CLOCKED_IN,
          clockedInAt: '2026-04-14T08:00:00.000Z',
          breakStartedAt: null,
        }),
      );

      const result = await service.getStatus(
        ownerActor,
        BUSINESS_ID,
        EMPLOYEE_ID,
      );

      expect(clockRecordsRepository.findActive).not.toHaveBeenCalled();
      expect((result as { status: string }).status).toBe(
        ClockStatus.CLOCKED_IN,
      );
    });

    it('returns clocked_out when no active record exists', async () => {
      clockRecordsRepository.findActive.mockResolvedValue(null);

      const result = await service.getStatus(
        ownerActor,
        BUSINESS_ID,
        EMPLOYEE_ID,
      );

      expect((result as { status: string }).status).toBe(
        ClockStatus.CLOCKED_OUT,
      );
      expect(redisService.set).toHaveBeenCalled();
    });
  });
});
