import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { TIME_TRACKING_MESSAGES } from 'src/common/constants/messages/time-tracking.messages';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { UserRole } from 'src/modules/users/schemas/user.schema';
import { ClockActionDto } from '../dto/clock-action.dto';
import { EndBreakDto } from '../dto/end-break.dto';
import { ClockRecordsRepository } from '../repositories/clock-records.repository';
import { EmployeesRepository } from '../repositories/employees.repository';
import { ClockRecord, ClockStatus } from '../schemas/clock-record.schema';
import { Employee } from '../schemas/employee.schema';

export interface ClockStatusPayload {
  status: ClockStatus;
  clockedInAt: Date | null;
  breakStartedAt: Date | null;
}

const BUSINESS_TZ_CACHE_PREFIX = 'business:tz:';
const BUSINESS_TZ_CACHE_TTL = 60 * 60;

const clockStatusCacheKey = (businessId: string, employeeId: string): string =>
  `${businessId}:clock:${employeeId}`;

@Injectable()
export class ClockService {
  constructor(
    private readonly employeesRepository: EmployeesRepository,
    private readonly clockRecordsRepository: ClockRecordsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Starts a clock session for an employee.
   *
   * Example:
   *   POST /clock/in
   *   { "employeeId": "..." }
   */
  async clockIn(
    actor: JwtUser,
    businessId: string,
    dto: ClockActionDto,
  ): Promise<
    | { clockRecordId: string; clockedInAt: Date }
    | ConflictException
    | ForbiddenException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const access = await this.resolveTargetEmployee(
        actor,
        bId,
        dto.employeeId,
      );
      if (access instanceof Error) return access;

      const active = await this.clockRecordsRepository.findActive(
        bId,
        access._id,
      );
      if (active) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.ALREADY_CLOCKED_IN,
        );
      }

      const timezone = await this.resolveBusinessTimezone(businessId);
      const clockedInAt = this.toBusinessLocalTime(new Date(), timezone);

      const created = await this.clockRecordsRepository.create({
        businessId: bId,
        employeeId: access._id,
        clockInAt: clockedInAt,
        breakMinutes: 0,
        status: ClockStatus.CLOCKED_IN,
        timezone,
      });

      await this.writeClockStatusCache(businessId, dto.employeeId, {
        status: ClockStatus.CLOCKED_IN,
        clockedInAt,
        breakStartedAt: null,
      });

      return { clockRecordId: created._id.toString(), clockedInAt };
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.ALREADY_CLOCKED_IN,
        );
      }

      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async clockOut(
    actor: JwtUser,
    businessId: string,
    dto: ClockActionDto,
  ): Promise<
    | { clockRecordId: string; clockedOutAt: Date; totalHours: number }
    | ConflictException
    | ForbiddenException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const access = await this.resolveTargetEmployee(
        actor,
        bId,
        dto.employeeId,
      );
      if (access instanceof Error) return access;

      const active = await this.clockRecordsRepository.findActive(
        bId,
        access._id,
      );
      if (!active) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.NOT_CLOCKED_IN,
        );
      }

      const clockedOutAt = this.toBusinessLocalTime(
        new Date(),
        active.timezone ?? 'UTC',
      );
      const totalHours = this.calculateTotalHours(active, clockedOutAt);

      const updated = await this.clockRecordsRepository.clockOutActive(
        bId,
        access._id,
        clockedOutAt,
        totalHours,
      );

      if (!updated) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.NOT_CLOCKED_IN,
        );
      }

      await this.writeClockStatusCache(businessId, dto.employeeId, {
        status: ClockStatus.CLOCKED_OUT,
        clockedInAt: null,
        breakStartedAt: null,
      });

      return {
        clockRecordId: updated._id.toString(),
        clockedOutAt,
        totalHours,
      };
    } catch {
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async startBreak(
    actor: JwtUser,
    businessId: string,
    dto: ClockActionDto,
  ): Promise<
    | { clockRecordId: string; breakStartedAt: Date }
    | ConflictException
    | ForbiddenException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const access = await this.resolveTargetEmployee(
        actor,
        bId,
        dto.employeeId,
      );
      if (access instanceof Error) return access;

      const active = await this.clockRecordsRepository.findActive(
        bId,
        access._id,
      );
      if (!active) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.NOT_CLOCKED_IN,
        );
      }

      if (active.breakStartedAt) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.ALREADY_ON_BREAK,
        );
      }

      const breakStartedAt = this.toBusinessLocalTime(
        new Date(),
        active.timezone ?? 'UTC',
      );

      const updated = await this.clockRecordsRepository.startBreak(
        bId,
        access._id,
        breakStartedAt,
      );

      if (!updated) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.ALREADY_ON_BREAK,
        );
      }

      await this.writeClockStatusCache(businessId, dto.employeeId, {
        status: ClockStatus.ON_BREAK,
        clockedInAt: active.clockInAt,
        breakStartedAt,
      });

      return {
        clockRecordId: updated._id.toString(),
        breakStartedAt,
      };
    } catch {
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async endBreak(
    actor: JwtUser,
    businessId: string,
    dto: EndBreakDto,
  ): Promise<
    | { clockRecordId: string; breakMinutes: number }
    | ConflictException
    | ForbiddenException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const access = await this.resolveTargetEmployee(
        actor,
        bId,
        dto.employeeId,
      );
      if (access instanceof Error) return access;

      const active = await this.clockRecordsRepository.findActive(
        bId,
        access._id,
      );
      if (!active) {
        return new ConflictException(
          TIME_TRACKING_MESSAGES.ERROR.NOT_CLOCKED_IN,
        );
      }

      if (!active.breakStartedAt) {
        return new ConflictException(TIME_TRACKING_MESSAGES.ERROR.NOT_ON_BREAK);
      }

      const updated = await this.clockRecordsRepository.endBreak(
        bId,
        access._id,
        dto.breakDurationMinutes,
      );

      if (!updated) {
        return new ConflictException(TIME_TRACKING_MESSAGES.ERROR.NOT_ON_BREAK);
      }

      await this.writeClockStatusCache(businessId, dto.employeeId, {
        status: ClockStatus.CLOCKED_IN,
        clockedInAt: active.clockInAt,
        breakStartedAt: null,
      });

      return {
        clockRecordId: updated._id.toString(),
        breakMinutes: updated.breakMinutes,
      };
    } catch {
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getStatus(
    actor: JwtUser,
    businessId: string,
    employeeId: string,
  ): Promise<
    | ClockStatusPayload
    | ForbiddenException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const access = await this.resolveTargetEmployee(actor, bId, employeeId);
      if (access instanceof Error) return access;

      const cacheKey = clockStatusCacheKey(businessId, employeeId);
      const cached = await this.redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached) as ClockStatusPayload;
      }

      const active = await this.clockRecordsRepository.findActive(
        bId,
        access._id,
      );

      const status: ClockStatusPayload = active
        ? {
            status: active.status,
            clockedInAt: active.clockInAt,
            breakStartedAt: active.breakStartedAt ?? null,
          }
        : {
            status: ClockStatus.CLOCKED_OUT,
            clockedInAt: null,
            breakStartedAt: null,
          };

      await this.writeClockStatusCache(businessId, employeeId, status);
      return status;
    } catch {
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private async resolveTargetEmployee(
    actor: JwtUser,
    businessId: Types.ObjectId,
    employeeId: string,
  ): Promise<Employee | ForbiddenException | NotFoundException> {
    if (actor.userRole === UserRole.CLIENT) {
      return new ForbiddenException(
        TIME_TRACKING_MESSAGES.ERROR.FORBIDDEN_ACTION,
      );
    }

    const employee = await this.employeesRepository.findById(
      employeeId,
      businessId,
    );

    if (!employee) {
      return new NotFoundException(
        TIME_TRACKING_MESSAGES.ERROR.EMPLOYEE_NOT_FOUND,
      );
    }

    if (actor.userRole === UserRole.EMPLOYEE) {
      const currentEmployee = await this.employeesRepository.findByUserId(
        actor.sub,
        businessId,
      );

      if (!currentEmployee || currentEmployee._id.toString() !== employeeId) {
        return new ForbiddenException(
          TIME_TRACKING_MESSAGES.ERROR.FORBIDDEN_ACTION,
        );
      }
    }

    return employee;
  }

  private calculateTotalHours(active: ClockRecord, clockedOutAt: Date): number {
    const elapsedHours =
      (clockedOutAt.getTime() - active.clockInAt.getTime()) / 3_600_000;
    const breakHours = (active.breakMinutes ?? 0) / 60;
    return toTwoDecimal(Math.max(0, elapsedHours - breakHours));
  }

  private async resolveBusinessTimezone(businessId: string): Promise<string> {
    const cacheKey = `${BUSINESS_TZ_CACHE_PREFIX}${businessId}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return cached;

      const business = await this.businessRepository.findById(businessId);
      const timezone = business?.timezone ?? 'UTC';

      await this.redisService
        .set(cacheKey, timezone, BUSINESS_TZ_CACHE_TTL)
        .catch(() => undefined);

      return timezone;
    } catch {
      return 'UTC';
    }
  }

  private async writeClockStatusCache(
    businessId: string,
    employeeId: string,
    payload: ClockStatusPayload,
  ): Promise<void> {
    await this.redisService
      .set(
        clockStatusCacheKey(businessId, employeeId),
        JSON.stringify(payload),
        CACHE_TTL.CLOCK_STATUS,
      )
      .catch(() => undefined);
  }

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

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
