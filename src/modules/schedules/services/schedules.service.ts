import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { SCHEDULES_MESSAGES } from 'src/common/constants/messages/schedules.messages';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { CreateShiftDto } from '../dto/create-shift.dto';
import { ListSchedulesDto } from '../dto/list-schedules.dto';
import { UpdateShiftDto } from '../dto/update-shift.dto';
import { ShiftsRepository } from '../repositories/shifts.repository';
import { Shift } from '../schemas/shift.schema';

interface SchedulesListResult {
  weekStartDate: string;
  data: Shift[];
}

const schedulesWeekCacheKey = (
  businessId: string,
  weekStartDate: string,
): string => `${businessId}:schedules:${weekStartDate}`;

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly shiftsRepository: ShiftsRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
  ) {}

  async listSchedules(
    businessId: string,
    dto: ListSchedulesDto,
  ): Promise<SchedulesListResult | InternalServerErrorException> {
    try {
      const weekStartDate = await this.resolveRequestedWeekStartDate(
        businessId,
        dto.weekStartDate,
      );

      const cacheKey = schedulesWeekCacheKey(
        businessId,
        weekStartDate.toISOString(),
      );

      let shifts: Shift[];
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        shifts = JSON.parse(cached) as Shift[];
      } else {
        shifts = await this.shiftsRepository.findWeekShifts(
          new Types.ObjectId(businessId),
          weekStartDate,
        );

        await this.redisService
          .set(cacheKey, JSON.stringify(shifts), CACHE_TTL.SCHEDULES_WEEK)
          .catch(() => undefined);
      }

      const filtered = dto.employeeId
        ? shifts.filter(
            (shift) =>
              shift.employeeId.toString() === dto.employeeId ||
              (typeof shift.employeeId === 'object' &&
                '_id' in shift.employeeId &&
                (shift.employeeId as { _id: Types.ObjectId })._id.toString() ===
                  dto.employeeId),
          )
        : shifts;

      return {
        weekStartDate: weekStartDate.toISOString(),
        data: filtered,
      };
    } catch (error) {
      this.logger.error(
        `listSchedules: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createShift(
    businessId: string,
    dto: CreateShiftDto,
  ): Promise<
    | Shift
    | NotFoundException
    | BadRequestException
    | ConflictException
    | InternalServerErrorException
  > {
    try {
      if (dto.startTime >= dto.endTime) {
        return new BadRequestException(SCHEDULES_MESSAGES.ERROR.CONFLICT);
      }

      const bId = new Types.ObjectId(businessId);
      const employee = await this.employeesRepository.findById(
        dto.employeeId,
        bId,
      );
      if (!employee) {
        return new NotFoundException(SCHEDULES_MESSAGES.ERROR.NOT_FOUND);
      }

      const shiftDate = this.normalizeDateOnly(dto.shiftDate);
      const weekStartDate = this.getMondayOfWeek(shiftDate);

      const overlap = await this.shiftsRepository.findOverlappingShift(
        bId,
        employee._id,
        shiftDate,
        dto.startTime,
        dto.endTime,
      );

      if (overlap) {
        return new ConflictException(SCHEDULES_MESSAGES.ERROR.CONFLICT);
      }

      const created = await this.shiftsRepository.create({
        businessId: bId,
        employeeId: employee._id,
        shiftDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes,
        weekStartDate,
      });

      await this.invalidateWeekCache(businessId, weekStartDate);
      return created;
    } catch (error) {
      this.logger.error(
        `createShift: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateShift(
    id: string,
    businessId: string,
    dto: UpdateShiftDto,
  ): Promise<
    | Shift
    | NotFoundException
    | BadRequestException
    | ConflictException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.shiftsRepository.findById(id, bId);
      if (!existing) {
        return new NotFoundException(SCHEDULES_MESSAGES.ERROR.NOT_FOUND);
      }

      const nextEmployeeId = dto.employeeId
        ? new Types.ObjectId(dto.employeeId)
        : existing.employeeId;
      const nextShiftDate = dto.shiftDate
        ? this.normalizeDateOnly(dto.shiftDate)
        : existing.shiftDate;
      const nextStartTime = dto.startTime ?? existing.startTime;
      const nextEndTime = dto.endTime ?? existing.endTime;

      if (nextStartTime >= nextEndTime) {
        return new BadRequestException(SCHEDULES_MESSAGES.ERROR.CONFLICT);
      }

      const employee = await this.employeesRepository.findById(
        nextEmployeeId.toString(),
        bId,
      );
      if (!employee) {
        return new NotFoundException(SCHEDULES_MESSAGES.ERROR.NOT_FOUND);
      }

      const overlap = await this.shiftsRepository.findOverlappingShift(
        bId,
        nextEmployeeId,
        nextShiftDate,
        nextStartTime,
        nextEndTime,
        id,
      );
      if (overlap) {
        return new ConflictException(SCHEDULES_MESSAGES.ERROR.CONFLICT);
      }

      const weekStartDate = this.getMondayOfWeek(nextShiftDate);
      const updated = await this.shiftsRepository.updateById(id, bId, {
        ...(dto.employeeId !== undefined && { employeeId: nextEmployeeId }),
        ...(dto.shiftDate !== undefined && { shiftDate: nextShiftDate }),
        ...(dto.startTime !== undefined && { startTime: nextStartTime }),
        ...(dto.endTime !== undefined && { endTime: nextEndTime }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.shiftDate !== undefined && { weekStartDate }),
      });

      if (!updated) {
        return new NotFoundException(SCHEDULES_MESSAGES.ERROR.NOT_FOUND);
      }

      await Promise.all([
        this.invalidateWeekCache(businessId, existing.weekStartDate),
        this.invalidateWeekCache(businessId, weekStartDate),
      ]);

      return updated;
    } catch (error) {
      this.logger.error(
        `updateShift: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteShift(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.shiftsRepository.findById(id, bId);
      if (!existing) {
        return new NotFoundException(SCHEDULES_MESSAGES.ERROR.NOT_FOUND);
      }

      const deleted = await this.shiftsRepository.softDelete(id, bId);
      if (!deleted) {
        return new NotFoundException(SCHEDULES_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.invalidateWeekCache(businessId, existing.weekStartDate);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteShift: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private async resolveRequestedWeekStartDate(
    businessId: string,
    requestedWeekStartDate?: string,
  ): Promise<Date> {
    if (requestedWeekStartDate) {
      return this.getMondayOfWeek(
        this.normalizeDateOnly(requestedWeekStartDate),
      );
    }

    const business = await this.businessRepository.findById(businessId);
    const localNow = toBusinessLocalTime(
      new Date(),
      business?.timezone ?? 'UTC',
    );
    return this.getMondayOfWeek(this.normalizeDateOnly(localNow));
  }

  private normalizeDateOnly(value: string | Date): Date {
    const date = new Date(value);
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private getMondayOfWeek(date: Date): Date {
    const copy = new Date(date);
    const day = copy.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setUTCDate(copy.getUTCDate() + diff);
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
  }

  private async invalidateWeekCache(
    businessId: string,
    weekStartDate: Date,
  ): Promise<void> {
    await this.redisService
      .del(schedulesWeekCacheKey(businessId, weekStartDate.toISOString()))
      .catch(() => undefined);
  }
}
