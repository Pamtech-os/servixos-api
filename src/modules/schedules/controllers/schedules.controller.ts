import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SCHEDULES_MESSAGES } from 'src/common/constants/messages/schedules.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { CreateShiftDto } from '../dto/create-shift.dto';
import { ListSchedulesDto } from '../dto/list-schedules.dto';
import { ShiftIdParamDto } from '../dto/shift-id-param.dto';
import { UpdateShiftDto } from '../dto/update-shift.dto';
import { SchedulesService } from '../services/schedules.service';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listSchedules(
    @CurrentUser() user: JwtUser,
    @Query() query: ListSchedulesDto,
  ) {
    const result = await this.schedulesService.listSchedules(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: SCHEDULES_MESSAGES.SUCCESS.RETRIEVED,
      weekStartDate: result.weekStartDate,
      data: result.data,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createShift(@CurrentUser() user: JwtUser, @Body() dto: CreateShiftDto) {
    const result = await this.schedulesService.createShift(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: SCHEDULES_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateShift(
    @CurrentUser() user: JwtUser,
    @Param() params: ShiftIdParamDto,
    @Body() dto: UpdateShiftDto,
  ) {
    const result = await this.schedulesService.updateShift(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: SCHEDULES_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteShift(
    @CurrentUser() user: JwtUser,
    @Param() params: ShiftIdParamDto,
  ) {
    const result = await this.schedulesService.deleteShift(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: SCHEDULES_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }
}
