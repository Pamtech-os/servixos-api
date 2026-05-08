import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentClient } from '../decorators/current-client.decorator';
import { ListClientMessagesDto } from '../dto/list-client-messages.dto';
import { ProviderIdParamDto } from '../dto/provider-id-param.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientMessagesGateway } from '../gateways/client-messages.gateway';
import { ClientMessagesService } from '../services/client-messages.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/messages')
export class ClientMessagesController {
  constructor(
    private readonly messagesService: ClientMessagesService,
    private readonly messagesGateway: ClientMessagesGateway,
  ) {}

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  async listConversations(@CurrentClient() client: ClientRequestUser) {
    const result = await this.messagesService.listConversations(
      client.businessId,
      client.clientId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.MESSAGE.SUCCESS.CONVERSATIONS_RETRIEVED,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('conversations/:providerId')
  @HttpCode(HttpStatus.OK)
  async listConversationMessages(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: ProviderIdParamDto,
    @Query() query: ListClientMessagesDto,
  ) {
    const result = await this.messagesService.listConversationMessages(
      client.businessId,
      client.clientId,
      params.providerId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.MESSAGE.SUCCESS.MESSAGES_RETRIEVED,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('conversations/:providerId/read')
  @HttpCode(HttpStatus.OK)
  async markConversationRead(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: ProviderIdParamDto,
  ) {
    const result = await this.messagesService.markConversationAsRead(
      client.businessId,
      client.clientId,
      params.providerId,
    );
    if (result instanceof HttpException) throw result;

    await this.messagesGateway.emitConversationRead(
      client.businessId,
      client.clientId,
      params.providerId,
    );

    return {
      message: CLIENT_MESSAGES.MESSAGE.SUCCESS.MARKED_READ,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }
}
