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
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { AdminRolesService } from '../services/admin-roles.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignRoleDto,
} from '../dto/create-role.dto';
import { InviteAdminDto } from '../dto/invite-admin.dto';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/roles')
export class AdminRolesController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @Get()
  async listRoles() {
    const result = await this.adminRolesService.listRoles();
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.ROLES_RETRIEVED, data: result };
  }

  @Get('team')
  async listTeamMembers() {
    const result = await this.adminRolesService.listTeamMembers();
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TEAM_RETRIEVED, data: result };
  }

  @Post()
  async createRole(@Body() dto: CreateRoleDto) {
    const result = await this.adminRolesService.createRole(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.ROLE_CREATED, data: result };
  }

  @Patch('assign')
  @HttpCode(HttpStatus.OK)
  async assignRole(@Body() dto: AssignRoleDto) {
    const result = await this.adminRolesService.assignRole(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.ROLE_ASSIGNED, data: result };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const result = await this.adminRolesService.updateRole(id, dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.ROLE_UPDATED, data: result };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteRole(@Param('id') id: string) {
    const result = await this.adminRolesService.deleteRole(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.ROLE_DELETED, data: result };
  }

  @Post('team/invite')
  async inviteAdmin(@Body() dto: InviteAdminDto) {
    const result = await this.adminRolesService.inviteAdmin(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.ADMIN_INVITED, data: result };
  }
}
