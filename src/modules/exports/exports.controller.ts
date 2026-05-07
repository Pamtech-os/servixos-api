import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ExportsService } from './exports.service';

/*
 * Maps to GET /clients/:id/export without duplicating all client routes into this module.
 * ExportsController owns only the export sub-route; all other CRUD lives in ClientsController.
 */
@Controller('clients')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  async exportClient(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.exportsService.exportClient(id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENTS_MESSAGES.SUCCESS.DATA_EXPORTED,
      data: result,
    };
  }
}
