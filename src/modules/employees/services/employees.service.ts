import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { JOBS } from 'src/common/constants/agenda.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { hashValue } from 'src/common/utils/hash.util';
import { EmployeeInvitationJobData } from 'src/modules/agenda/jobs/email.jobs';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { RolesRepository } from 'src/modules/roles/repositories/roles.repository';
import { UserRole } from 'src/modules/users/schemas/user.schema';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import {
  getAvatarColor,
  getInitials,
  OnlineUser,
} from '../constants/presence.constants';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { QueryClockHistoryDto } from '../dto/query-clock-history.dto';
import { QueryEmployeesDto } from '../dto/query-employees.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { ClockRecordsRepository } from '../repositories/clock-records.repository';
import { EmployeesRepository } from '../repositories/employees.repository';
import { ClockRecord } from '../schemas/clock-record.schema';
import { Employee } from '../schemas/employee.schema';

const EMPLOYEE_TEMP_PASSWORD = 'Servix@2024';

export interface PaginatedEmployees {
  data: Employee[];
  meta: ReturnType<typeof buildMeta>;
}

export interface EmployeeDetails extends Employee {
  weeklyHours: number;
  recentClockEntries: ClockRecord[];
}

export interface PaginatedClockHistory {
  data: ClockRecord[];
  meta: ReturnType<typeof buildMeta>;
}

const employeesListVersionKey = (businessId: string): string =>
  `${businessId}:employees:list:version`;

const employeesListCacheKey = (
  businessId: string,
  version: string,
  search: string,
  roleId: string,
  page: number,
  limit: number,
): string =>
  `${businessId}:employees:list:v${version}:s${search}:r${roleId}:p${page}:l${limit}`;

const employeeDetailCacheKey = (
  businessId: string,
  employeeId: string,
): string => `${businessId}:employees:${employeeId}`;

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly employeesRepository: EmployeesRepository,
    private readonly clockRecordsRepository: ClockRecordsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly agendaService: AgendaService,
    private readonly redisService: RedisService,
  ) {}

  async listEmployees(
    businessId: string,
    dto: QueryEmployeesDto,
  ): Promise<PaginatedEmployees | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const version = await this.getListVersion(businessId);
      const cacheKey = employeesListCacheKey(
        businessId,
        version,
        dto.search ?? '',
        dto.roleId ?? '',
        pagination.page,
        pagination.limit,
      );

      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedEmployees;
      }

      const { data, total } = await this.employeesRepository.findAll(
        new Types.ObjectId(businessId),
        { search: dto.search, roleId: dto.roleId },
        pagination,
      );

      const result: PaginatedEmployees = {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.EMPLOYEES_LIST)
        .catch((error: unknown) =>
          this.logger.warn(
            `listEmployees: cache write failed [businessId=${businessId}] ${error instanceof Error ? error.message : String(error)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `listEmployees: unexpected error [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Retrieves one employee plus computed dashboard-ready time stats.
   *
   * Example:
   *   GET /employees/:id
   *   -> {
   *        ...employee,
   *        weeklyHours: 32.5,
   *        recentClockEntries: [three most recent records]
   *      }
   */
  async getEmployee(
    id: string,
    businessId: string,
  ): Promise<
    EmployeeDetails | NotFoundException | InternalServerErrorException
  > {
    try {
      const cacheKey = employeeDetailCacheKey(businessId, id);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as EmployeeDetails;
      }

      const employee = await this.employeesRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );

      if (!employee) {
        return new NotFoundException(EMPLOYEES_MESSAGES.ERROR.NOT_FOUND);
      }

      const business = await this.businessRepository.findById(businessId);
      const nowLocal = this.toBusinessLocalTime(
        new Date(),
        business?.timezone ?? 'UTC',
      );
      const [weekStart, weekEnd] = this.getCurrentBusinessWeekRange(nowLocal);
      const [weeklyHoursRaw, recentClockEntries] = await Promise.all([
        this.clockRecordsRepository.sumTotalHoursWithinRange(
          new Types.ObjectId(businessId),
          employee._id,
          weekStart,
          weekEnd,
        ),
        this.clockRecordsRepository.findRecentByEmployee(
          new Types.ObjectId(businessId),
          employee._id,
          3,
        ),
      ]);

      const result: EmployeeDetails = {
        ...employee,
        weeklyHours: toTwoDecimal(weeklyHoursRaw),
        recentClockEntries,
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.EMPLOYEE_DETAIL)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `getEmployee: unexpected error [id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Creates an employee + linked user account atomically.
   *
   * Example:
   *   POST /employees
   *   {
   *     "fullName": "Sarah Connor",
   *     "email": "sarah@business.com",
   *     "roleId": "..."
   *   }
   */
  async createEmployee(
    businessId: string,
    dto: CreateEmployeeDto,
  ): Promise<
    | Employee
    | ConflictException
    | NotFoundException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const [business, role, existingEmployee, existingUser] =
        await Promise.all([
          this.businessRepository.findById(businessId),
          this.rolesRepository.findById(dto.roleId, bId),
          this.employeesRepository.findByEmail(dto.email, bId),
          this.usersRepository.findByEmail(dto.email),
        ]);

      if (!business || business.deletedAt) {
        await session.abortTransaction();
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      if (!role) {
        await session.abortTransaction();
        return new NotFoundException(EMPLOYEES_MESSAGES.ERROR.ROLE_NOT_FOUND);
      }

      if (existingEmployee || existingUser) {
        await session.abortTransaction();
        return new ConflictException(EMPLOYEES_MESSAGES.ERROR.EMAIL_TAKEN);
      }

      const passwordHash = await hashValue(EMPLOYEE_TEMP_PASSWORD);
      const { firstName, lastName } = this.splitFullName(dto.fullName);

      const user = await this.usersRepository.create(
        {
          firstName,
          lastName,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          userRole: UserRole.EMPLOYEE,
          businessId: bId,
          roleId: new Types.ObjectId(dto.roleId),
          isActive: true,
          isEmailVerified: true,
          mustChangePassword: true,
        },
        session,
      );

      const dateJoined = dto.dateJoined ? new Date(dto.dateJoined) : undefined;

      const employee = await this.employeesRepository.create(
        {
          businessId: bId,
          userId: user._id,
          roleId: new Types.ObjectId(dto.roleId),
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          weeklyHoursTarget: dto.weeklyHoursTarget,
          dateJoined,
        },
        session,
      );

      await this.usersRepository.updateById(
        user._id,
        { employeeId: employee._id },
        session,
      );

      await session.commitTransaction();

      void this.agendaService
        .now<EmployeeInvitationJobData>(JOBS.EMAIL_EMPLOYEE_INVITATION, {
          to: dto.email,
          firstName,
          businessName: business.name,
          temporaryPassword: EMPLOYEE_TEMP_PASSWORD,
        })
        .catch((error: unknown) =>
          this.logger.error(
            `createEmployee: invitation job failed [email=${dto.email}] ${error instanceof Error ? error.stack : String(error)}`,
          ),
        );

      void this.invalidateEmployeesListCache(businessId);

      return employee;
    } catch (error) {
      await this.abortQuietly(session);

      if (this.isDuplicateKeyError(error)) {
        return new ConflictException(EMPLOYEES_MESSAGES.ERROR.EMAIL_TAKEN);
      }

      this.logger.error(
        `createEmployee: unexpected error [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async updateEmployee(
    id: string,
    businessId: string,
    dto: UpdateEmployeeDto,
  ): Promise<
    | Employee
    | NotFoundException
    | ConflictException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.employeesRepository.findById(id, bId);

      if (!existing) {
        await session.abortTransaction();
        return new NotFoundException(EMPLOYEES_MESSAGES.ERROR.NOT_FOUND);
      }

      if (dto.roleId) {
        const role = await this.rolesRepository.findById(dto.roleId, bId);
        if (!role) {
          await session.abortTransaction();
          return new NotFoundException(EMPLOYEES_MESSAGES.ERROR.ROLE_NOT_FOUND);
        }
      }

      if (dto.email) {
        const [employeeEmailHit, userEmailHit] = await Promise.all([
          this.employeesRepository.findByEmail(dto.email, bId),
          this.usersRepository.findByEmail(dto.email),
        ]);

        if (employeeEmailHit && employeeEmailHit._id.toString() !== id) {
          await session.abortTransaction();
          return new ConflictException(EMPLOYEES_MESSAGES.ERROR.EMAIL_TAKEN);
        }

        if (
          userEmailHit &&
          (!existing.userId ||
            userEmailHit._id.toString() !== existing.userId.toString())
        ) {
          await session.abortTransaction();
          return new ConflictException(EMPLOYEES_MESSAGES.ERROR.EMAIL_TAKEN);
        }
      }

      const updated = await this.employeesRepository.updateById(
        id,
        bId,
        {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          roleId: dto.roleId ? new Types.ObjectId(dto.roleId) : undefined,
          weeklyHoursTarget: dto.weeklyHoursTarget,
          dateJoined: dto.dateJoined ? new Date(dto.dateJoined) : undefined,
        },
        session,
      );

      if (!updated) {
        await session.abortTransaction();
        return new NotFoundException(EMPLOYEES_MESSAGES.ERROR.NOT_FOUND);
      }

      if (updated.userId) {
        const userUpdate: Record<string, unknown> = {};

        if (dto.email !== undefined) userUpdate['email'] = dto.email;
        if (dto.phone !== undefined) userUpdate['phone'] = dto.phone;
        if (dto.roleId !== undefined)
          userUpdate['roleId'] = new Types.ObjectId(dto.roleId);

        const { firstName, lastName } = this.splitFullName(
          dto.fullName ?? updated.fullName,
        );

        if (dto.fullName !== undefined) {
          userUpdate['firstName'] = firstName;
          userUpdate['lastName'] = lastName;
        }

        await this.usersRepository.updateById(
          updated.userId,
          userUpdate,
          session,
        );
      }

      await session.commitTransaction();

      void this.invalidateEmployeesListCache(businessId);
      await this.redisService
        .del(employeeDetailCacheKey(businessId, id))
        .catch(() => undefined);

      return updated;
    } catch (error) {
      await this.abortQuietly(session);

      if (this.isDuplicateKeyError(error)) {
        return new ConflictException(EMPLOYEES_MESSAGES.ERROR.EMAIL_TAKEN);
      }

      this.logger.error(
        `updateEmployee: unexpected error [id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async deleteEmployee(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.employeesRepository.findById(id, bId);

      if (!existing) {
        await session.abortTransaction();
        return new NotFoundException(EMPLOYEES_MESSAGES.ERROR.NOT_FOUND);
      }

      if (existing.userId) {
        await this.usersRepository.updateById(
          existing.userId,
          {
            deletedAt: new Date(),
            isActive: false,
            employeeId: undefined,
          },
          session,
        );
      }

      await this.employeesRepository.softDelete(id, bId, session);
      await session.commitTransaction();

      void this.invalidateEmployeesListCache(businessId);
      await this.redisService
        .del(employeeDetailCacheKey(businessId, id))
        .catch(() => undefined);

      return null;
    } catch (error) {
      await this.abortQuietly(session);
      this.logger.error(
        `deleteEmployee: unexpected error [id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async getClockHistory(
    id: string,
    businessId: string,
    dto: QueryClockHistoryDto,
  ): Promise<
    | PaginatedClockHistory
    | BadRequestException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const employee = await this.employeesRepository.findById(id, bId);

      if (!employee) {
        return new NotFoundException(EMPLOYEES_MESSAGES.ERROR.NOT_FOUND);
      }

      const pagination = resolvePagination(dto.page, dto.limit);

      const business = await this.businessRepository.findById(businessId);
      const timezone = business?.timezone ?? 'UTC';

      const startDate = dto.startDate
        ? this.toBusinessLocalTime(new Date(dto.startDate), timezone)
        : undefined;
      const endDate = dto.endDate
        ? this.toBusinessLocalTime(new Date(dto.endDate), timezone)
        : undefined;

      if (startDate && endDate && startDate > endDate) {
        return new BadRequestException(COMMON_MESSAGES.ERROR.BAD_REQUEST);
      }

      const { data, total } =
        await this.clockRecordsRepository.findHistoryByEmployee(
          bId,
          employee._id,
          {
            startDate,
            endDate,
          },
          pagination,
        );

      return {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `getClockHistory: unexpected error [id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getOnlineEmployees(
    businessId: string,
  ): Promise<{ count: number; users: OnlineUser[] }> {
    const raw = await this.redisService.hgetall(`presence:${businessId}`);
    if (!raw || Object.keys(raw).length === 0) {
      return { count: 0, users: [] };
    }

    const users = Object.values(raw)
      .map((value) => this.parseOnlineUser(value))
      .filter((item): item is OnlineUser => !!item)
      .map((item) => ({
        ...item,
        initials: getInitials(item.fullName),
        avatarColor: getAvatarColor(item.userId),
      }));

    return { count: users.length, users };
  }

  private parseOnlineUser(value: string): OnlineUser | null {
    try {
      return JSON.parse(value) as OnlineUser;
    } catch {
      return null;
    }
  }

  private splitFullName(fullName: string): {
    firstName: string;
    lastName: string;
  } {
    const chunks = fullName.trim().split(/\s+/).filter(Boolean);

    if (chunks.length === 0) {
      return { firstName: 'Team', lastName: 'Member' };
    }

    if (chunks.length === 1) {
      return { firstName: chunks[0], lastName: 'Member' };
    }

    return {
      firstName: chunks[0],
      lastName: chunks.slice(1).join(' '),
    };
  }

  /**
   * Current week window based on Monday 00:00 -> next Monday 00:00.
   *
   * Example:
   * - nowLocal = Wednesday 2026-05-13 09:00
   * - start = Monday 2026-05-11 00:00
   * - end   = Monday 2026-05-18 00:00
   */
  private getCurrentBusinessWeekRange(nowLocal: Date): [Date, Date] {
    const start = new Date(nowLocal);
    const day = start.getUTCDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setUTCDate(start.getUTCDate() - diffToMonday);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);

    return [start, end];
  }

  /**
   * Converts UTC to a business-local wall-clock timestamp while keeping Date type.
   *
   * Example:
   * - utcDate: 2026-05-08T15:00:00.000Z
   * - timezone: America/New_York (UTC-4)
   * - stored: 2026-05-08T11:00:00.000Z
   */
  private toBusinessLocalTime(utcDate: Date, timezone: string): Date {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(utcDate);

      const p: Record<string, string> = {};
      for (const part of parts) {
        p[part.type] = part.value;
      }

      const hour = p['hour'] === '24' ? '00' : p['hour'];
      return new Date(
        `${p['year']}-${p['month']}-${p['day']}T${hour}:${p['minute']}:${p['second']}Z`,
      );
    } catch {
      return utcDate;
    }
  }

  private async getListVersion(businessId: string): Promise<string> {
    try {
      const key = employeesListVersionKey(businessId);
      const version = await this.redisService.get(key);
      if (version) return version;

      await this.redisService.set(key, '1', CACHE_TTL.EMPLOYEES_LIST_VERSION);
      return '1';
    } catch {
      return '1';
    }
  }

  private async invalidateEmployeesListCache(
    businessId: string,
  ): Promise<void> {
    try {
      await this.redisService.incr(employeesListVersionKey(businessId));
    } catch (error) {
      this.logger.warn(
        `invalidateEmployeesListCache: failed [businessId=${businessId}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async abortQuietly(session: {
    abortTransaction: () => Promise<void>;
  }): Promise<void> {
    await session.abortTransaction().catch(() => undefined);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
