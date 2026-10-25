import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentClient } from '../decorators/current-client.decorator';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientContactsService } from '../services/client-contacts.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/contacts')
export class ClientContactsController {
  constructor(private readonly contactsService: ClientContactsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listContacts(@CurrentClient() client: ClientRequestUser) {
    const result = await this.contactsService.listContacts(
      client.businessId,
      client.clientId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.CONTACT.SUCCESS.RETRIEVED,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
