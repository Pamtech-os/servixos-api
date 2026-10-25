import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentClient } from '../decorators/current-client.decorator';
import { IdParamDto } from '../dto/id-param.dto';
import { ListClientInvoicesDto } from '../dto/list-client-invoices.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientInvoicesService } from '../services/client-invoices.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/invoices')
export class ClientInvoicesController {
  constructor(private readonly invoicesService: ClientInvoicesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listInvoices(
    @CurrentClient() client: ClientRequestUser,
    @Query() query: ListClientInvoicesDto,
  ) {
    const result = await this.invoicesService.listInvoices(
      client.businessId,
      client.clientId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.INVOICE.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getInvoice(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: IdParamDto,
  ) {
    const result = await this.invoicesService.getInvoice(
      client.businessId,
      client.clientId,
      params.id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.INVOICE.SUCCESS.FOUND,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
