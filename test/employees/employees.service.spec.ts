import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { ClockRecordsRepository } from 'src/modules/employees/repositories/clock-records.repository';
import { EmployeesService } from 'src/modules/employees/services/employees.service';
import { Employee } from 'src/modules/employees/schemas/employee.schema';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { RolesRepository } from 'src/modules/roles/repositories/roles.repository';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';

const BUSINESS_ID = '664abc123456789012345678';
const EMPLOYEE_ID = '665def000000000000000001';
const USER_ID = '665def000000000000000002';
const ROLE_ID = '665def000000000000000003';

const bId = new Types.ObjectId(BUSINESS_ID);

const baseEmployee: Employee = {
  _id: new Types.ObjectId(EMPLOYEE_ID),
  businessId: bId,
  userId: new Types.ObjectId(USER_ID),
  roleId: new Types.ObjectId(ROLE_ID),
  fullName: 'Sarah Connor',
  email: 'sarah@business.com',
  phone: '+12025550102',
  weeklyHoursTarget: 40,
  dateJoined: new Date('2026-04-01T00:00:00.000Z'),
};

describe('EmployeesService', () => {
  let service: EmployeesService;

  let employeesRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByEmail: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    softDelete: jest.Mock;
  };
  let clockRecordsRepository: {
    sumTotalHoursWithinRange: jest.Mock;
    findRecentByEmployee: jest.Mock;
    findHistoryByEmployee: jest.Mock;
  };
  let usersRepository: {
    findByEmail: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
  };
  let rolesRepository: {
    findById: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    hgetall: jest.Mock;
  };
  let agendaService: {
    now: jest.Mock;
  };

  let mockConnection: {
    startSession: jest.Mock;
  };

  let mockSession: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };

  beforeEach(() => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    employeesRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      softDelete: jest.fn(),
    };

    clockRecordsRepository = {
      sumTotalHoursWithinRange: jest.fn(),
      findRecentByEmployee: jest.fn(),
      findHistoryByEmployee: jest.fn(),
    };

    usersRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateById: jest.fn().mockResolvedValue(undefined),
    };

    rolesRepository = {
      findById: jest
        .fn()
        .mockResolvedValue({ _id: new Types.ObjectId(ROLE_ID) }),
    };

    businessRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: bId,
        name: 'Skynet Services',
        timezone: 'America/New_York',
        deletedAt: undefined,
      }),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(2),
      hgetall: jest.fn().mockResolvedValue({}),
    };

    agendaService = {
      now: jest.fn().mockResolvedValue(undefined),
    };

    service = new EmployeesService(
      mockConnection as never,
      employeesRepository as unknown as EmployeesRepository,
      clockRecordsRepository as unknown as ClockRecordsRepository,
      usersRepository as unknown as UsersRepository,
      rolesRepository as unknown as RolesRepository,
      businessRepository as unknown as BusinessRepository,
      agendaService as unknown as AgendaService,
      redisService as unknown as RedisService,
    );
  });

  describe('listEmployees', () => {
    it('returns cached employee list when available', async () => {
      const cached = {
        data: [baseEmployee],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      redisService.get
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.listEmployees(BUSINESS_ID, {});

      expect(employeesRepository.findAll).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toEqual(JSON.stringify(cached));
    });

    it('queries repository and caches when cache misses', async () => {
      employeesRepository.findAll.mockResolvedValue({
        data: [baseEmployee],
        total: 1,
      });

      const result = await service.listEmployees(BUSINESS_ID, {
        page: 1,
        limit: 20,
      });

      expect(employeesRepository.findAll).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalled();
      expect(result).not.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('getEmployee', () => {
    it('returns employee details with weekly hours and recent entries', async () => {
      employeesRepository.findById.mockResolvedValue(baseEmployee);
      clockRecordsRepository.sumTotalHoursWithinRange.mockResolvedValue(12.345);
      clockRecordsRepository.findRecentByEmployee.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          employeeId: baseEmployee._id,
          businessId: bId,
          clockInAt: new Date(),
          breakMinutes: 0,
          timezone: 'America/New_York',
        },
      ]);

      const result = await service.getEmployee(EMPLOYEE_ID, BUSINESS_ID);

      expect(result).not.toBeInstanceOf(NotFoundException);
      expect((result as { weeklyHours: number }).weeklyHours).toBe(12.35);
    });

    it('returns NotFoundException when employee does not exist', async () => {
      employeesRepository.findById.mockResolvedValue(null);

      const result = await service.getEmployee(EMPLOYEE_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        EMPLOYEES_MESSAGES.ERROR.NOT_FOUND,
      );
    });
  });

  describe('createEmployee', () => {
    const dto = {
      fullName: 'Sarah Connor',
      email: 'sarah@business.com',
      phone: '+12025550102',
      roleId: ROLE_ID,
      weeklyHoursTarget: 40,
      dateJoined: '2026-04-01',
    };

    it('creates employee + linked user and queues invitation', async () => {
      employeesRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue({
        _id: new Types.ObjectId(USER_ID),
      });
      employeesRepository.create.mockResolvedValue(baseEmployee);

      const result = await service.createEmployee(BUSINESS_ID, dto);

      expect(result).toEqual(baseEmployee);
      expect(usersRepository.create).toHaveBeenCalledTimes(1);
      expect(usersRepository.updateById).toHaveBeenCalledTimes(1);
      expect(agendaService.now).toHaveBeenCalledTimes(1);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('returns conflict when email is already taken', async () => {
      employeesRepository.findByEmail.mockResolvedValue(baseEmployee);

      const result = await service.createEmployee(BUSINESS_ID, dto);

      expect(result).toBeInstanceOf(ConflictException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('returns not found when role does not exist', async () => {
      employeesRepository.findByEmail.mockResolvedValue(null);
      rolesRepository.findById.mockResolvedValue(null);

      const result = await service.createEmployee(BUSINESS_ID, dto);

      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  describe('getOnlineEmployees', () => {
    it('returns empty payload when redis has no online users', async () => {
      redisService.hgetall.mockResolvedValue({});

      const result = await service.getOnlineEmployees(BUSINESS_ID);

      expect(result).toEqual({ count: 0, users: [] });
    });

    it('parses online users and applies deterministic avatar details', async () => {
      redisService.hgetall.mockResolvedValue({
        one: JSON.stringify({
          userId: '64f1a2b3c4d5e6f7a8b9c0d1',
          employeeId: EMPLOYEE_ID,
          fullName: 'Priya Patel',
          initials: 'X',
          avatarColor: '#000000',
        }),
      });

      const result = await service.getOnlineEmployees(BUSINESS_ID);

      expect(result.count).toBe(1);
      expect(result.users[0].initials).toBe('PP');
      expect(result.users[0].avatarColor).toBeTruthy();
    });
  });
});
