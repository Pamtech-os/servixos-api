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
  Query,
} from '@nestjs/common';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { InvoiceIdParamDto } from '../dto/invoice-id-param.dto';
import { ListInvoicesDto } from '../dto/list-invoices.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { InvoicesService } from '../services/invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listInvoices(
    @CurrentUser() user: JwtUser,
    @Query() query: ListInvoicesDto,
  ) {
    const result = await this.invoicesService.listInvoices(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: INVOICES_MESSAGES.SUCCESS.RETRIEVED,
      statistics: result.statistics,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id/pdf')
  @HttpCode(HttpStatus.OK)
  async getInvoicePdf(
    @CurrentUser() user: JwtUser,
    @Param() params: InvoiceIdParamDto,
  ) {
    const result = await this.invoicesService.getInvoicePdf(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: INVOICES_MESSAGES.SUCCESS.PDF_READY,
      data: result,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getInvoice(
    @CurrentUser() user: JwtUser,
    @Param() params: InvoiceIdParamDto,
  ) {
    const result = await this.invoicesService.getInvoice(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: INVOICES_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    const result = await this.invoicesService.createInvoice(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: INVOICES_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateInvoice(
    @CurrentUser() user: JwtUser,
    @Param() params: InvoiceIdParamDto,
    @Body() dto: UpdateInvoiceDto,
  ) {
    const result = await this.invoicesService.updateInvoice(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: INVOICES_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteInvoice(
    @CurrentUser() user: JwtUser,
    @Param() params: InvoiceIdParamDto,
  ) {
    const result = await this.invoicesService.deleteInvoice(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: INVOICES_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async sendInvoice(
    @CurrentUser() user: JwtUser,
    @Param() params: InvoiceIdParamDto,
  ) {
    const result = await this.invoicesService.sendInvoice(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: INVOICES_MESSAGES.SUCCESS.SENT,
      data: result,
    };
  }
}
