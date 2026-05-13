import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { TIME_TRACKING_MESSAGES } from 'src/common/constants/messages/time-tracking.messages';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { ClockActionDto } from '../dto/clock-action.dto';
import { ClockStatusParamDto } from '../dto/clock-status-param.dto';
import { EndBreakDto } from '../dto/end-break.dto';
import { ClockService } from '../services/clock.service';

@Controller('clock')
export class ClockController {
  constructor(private readonly clockService: ClockService) {}

  @Post('in')
  @Permissions(PERMISSIONS.EMPLOYEES_EDIT)
  @HttpCode(HttpStatus.CREATED)
  async clockIn(@CurrentUser() user: JwtUser, @Body() dto: ClockActionDto) {
    const result = await this.clockService.clockIn(user, user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: TIME_TRACKING_MESSAGES.SUCCESS.CLOCKED_IN,
      data: result,
    };
  }

  @Post('out')
  @Permissions(PERMISSIONS.EMPLOYEES_EDIT)
  @HttpCode(HttpStatus.CREATED)
  async clockOut(@CurrentUser() user: JwtUser, @Body() dto: ClockActionDto) {
    const result = await this.clockService.clockOut(user, user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: TIME_TRACKING_MESSAGES.SUCCESS.CLOCKED_OUT,
      data: result,
    };
  }

  @Post('break/start')
  @Permissions(PERMISSIONS.EMPLOYEES_EDIT)
  @HttpCode(HttpStatus.CREATED)
  async startBreak(@CurrentUser() user: JwtUser, @Body() dto: ClockActionDto) {
    const result = await this.clockService.startBreak(
      user,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TIME_TRACKING_MESSAGES.SUCCESS.BREAK_STARTED,
      data: result,
    };
  }

  @Post('break/end')
  @Permissions(PERMISSIONS.EMPLOYEES_EDIT)
  @HttpCode(HttpStatus.CREATED)
  async endBreak(@CurrentUser() user: JwtUser, @Body() dto: EndBreakDto) {
    const result = await this.clockService.endBreak(user, user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: TIME_TRACKING_MESSAGES.SUCCESS.BREAK_ENDED,
      data: result,
    };
  }

  @Get('status/:employeeId')
  @Permissions(PERMISSIONS.EMPLOYEES_VIEW)
  @HttpCode(HttpStatus.OK)
  async getStatus(
    @CurrentUser() user: JwtUser,
    @Param() params: ClockStatusParamDto,
  ) {
    const result = await this.clockService.getStatus(
      user,
      user.businessId,
      params.employeeId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TIME_TRACKING_MESSAGES.SUCCESS.STATUS,
      data: result,
    };
  }
}
