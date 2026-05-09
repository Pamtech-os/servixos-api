import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';
import { RolesService } from '../services/roles.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
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
