import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';
import { PERMISSIONS } from 'src/common/constants/permissions.constants';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { RolesService } from '../services/roles.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions(PERMISSIONS.ROLES_VIEW)
  @HttpCode(HttpStatus.OK)
  async listPermissions() {
    const result = await this.rolesService.listPermissions();
    if (result instanceof HttpException) throw result;

    return {
      message: ROLES_MESSAGES.SUCCESS.PERMISSIONS_RETRIEVED,
      data: result,
    };
  }
}
