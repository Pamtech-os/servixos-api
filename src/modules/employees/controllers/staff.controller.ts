import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { STAFF_MESSAGES } from 'src/common/constants/messages/staff.messages';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { QueryClockHistoryDto } from '../dto/query-clock-history.dto';
import { QueryStaffDto } from '../dto/query-staff.dto';
import { StaffIdParamDto } from '../dto/staff-id-param.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import { EmployeesService } from '../services/employees.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Permissions(PERMISSIONS.EMPLOYEES_VIEW)
  @HttpCode(HttpStatus.OK)
  async listStaff(@CurrentUser() user: JwtUser, @Query() query: QueryStaffDto) {
    const result = await this.employeesService.listStaff(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: STAFF_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('online')
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async getOnlineStaff(@CurrentUser() user: JwtUser) {
    const result = await this.employeesService.getOnlineStaff(user.businessId);
    return {
      message: STAFF_MESSAGES.SUCCESS.ONLINE_LIST,
      data: result,
    };
  }

  @Get(':id/clock-history')
  @Permissions(PERMISSIONS.EMPLOYEES_VIEW)
  @HttpCode(HttpStatus.OK)
  async getClockHistory(
    @CurrentUser() user: JwtUser,
    @Param() params: StaffIdParamDto,
    @Query() query: QueryClockHistoryDto,
  ) {
    const result = await this.employeesService.getStaffClockHistory(
      params.id,
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: STAFF_MESSAGES.SUCCESS.CLOCK_HISTORY,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.EMPLOYEES_VIEW)
  @HttpCode(HttpStatus.OK)
  async getStaff(
    @CurrentUser() user: JwtUser,
    @Param() params: StaffIdParamDto,
  ) {
    const result = await this.employeesService.getStaff(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: STAFF_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @Permissions(PERMISSIONS.EMPLOYEES_CREATE)
  @HttpCode(HttpStatus.CREATED)
  async createStaff(@CurrentUser() user: JwtUser, @Body() dto: CreateStaffDto) {
    const result = await this.employeesService.createStaff(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: STAFF_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.EMPLOYEES_EDIT)
  @HttpCode(HttpStatus.OK)
  async updateStaff(
    @CurrentUser() user: JwtUser,
    @Param() params: StaffIdParamDto,
    @Body() dto: UpdateStaffDto,
  ) {
    const result = await this.employeesService.updateStaff(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: STAFF_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.EMPLOYEES_DELETE)
  @HttpCode(HttpStatus.OK)
  async deleteStaff(
    @CurrentUser() user: JwtUser,
    @Param() params: StaffIdParamDto,
  ) {
    const result = await this.employeesService.deleteStaff(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: STAFF_MESSAGES.SUCCESS.DELETED,
    };
  }
}
