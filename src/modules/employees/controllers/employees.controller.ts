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
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { EmployeeIdParamDto } from '../dto/employee-id-param.dto';
import { QueryClockHistoryDto } from '../dto/query-clock-history.dto';
import { QueryEmployeesDto } from '../dto/query-employees.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { EmployeesService } from '../services/employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listEmployees(
    @CurrentUser() user: JwtUser,
    @Query() query: QueryEmployeesDto,
  ) {
    const result = await this.employeesService.listEmployees(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: EMPLOYEES_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('online')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async getOnlineEmployees(@CurrentUser() user: JwtUser) {
    const result = await this.employeesService.getOnlineEmployees(
      user.businessId,
    );

    return {
      message: EMPLOYEES_MESSAGES.SUCCESS.ONLINE_LIST,
      data: result,
    };
  }

  @Get(':id/clock-history')
  @HttpCode(HttpStatus.OK)
  async getClockHistory(
    @CurrentUser() user: JwtUser,
    @Param() params: EmployeeIdParamDto,
    @Query() query: QueryClockHistoryDto,
  ) {
    const result = await this.employeesService.getClockHistory(
      params.id,
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: EMPLOYEES_MESSAGES.SUCCESS.CLOCK_HISTORY,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getEmployee(
    @CurrentUser() user: JwtUser,
    @Param() params: EmployeeIdParamDto,
  ) {
    const result = await this.employeesService.getEmployee(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: EMPLOYEES_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    const result = await this.employeesService.createEmployee(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: EMPLOYEES_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateEmployee(
    @CurrentUser() user: JwtUser,
    @Param() params: EmployeeIdParamDto,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const result = await this.employeesService.updateEmployee(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: EMPLOYEES_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteEmployee(
    @CurrentUser() user: JwtUser,
    @Param() params: EmployeeIdParamDto,
  ) {
    const result = await this.employeesService.deleteEmployee(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: EMPLOYEES_MESSAGES.SUCCESS.DELETED,
    };
  }
}
