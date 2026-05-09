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
} from '@nestjs/common';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { CreateRoleDto } from '../dto/create-role.dto';
import { RoleIdParamDto } from '../dto/role-id-param.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RolesService } from '../services/roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listRoles(@CurrentUser() user: JwtUser) {
    const result = await this.rolesService.listRoles(user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: ROLES_MESSAGES.SUCCESS.RETRIEVED,
      data: result,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getRole(@CurrentUser() user: JwtUser, @Param() params: RoleIdParamDto) {
    const result = await this.rolesService.getRole(params.id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: ROLES_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRole(@CurrentUser() user: JwtUser, @Body() dto: CreateRoleDto) {
    const result = await this.rolesService.createRole(user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: ROLES_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateRole(
    @CurrentUser() user: JwtUser,
    @Param() params: RoleIdParamDto,
    @Body() dto: UpdateRoleDto,
  ) {
    const result = await this.rolesService.updateRole(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: ROLES_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteRole(
    @CurrentUser() user: JwtUser,
    @Param() params: RoleIdParamDto,
  ) {
    const result = await this.rolesService.deleteRole(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: ROLES_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }
}
