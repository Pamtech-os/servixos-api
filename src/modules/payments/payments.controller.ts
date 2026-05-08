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
import { PAYMENTS_MESSAGES } from 'src/common/constants/messages/payments.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { PaymentIdParamDto } from './dto/payment-id-param.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listPayments(
    @CurrentUser() user: JwtUser,
    @Query() query: ListPaymentsDto,
  ) {
    const result = await this.paymentsService.listPayments(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: PAYMENTS_MESSAGES.SUCCESS.RETRIEVED,
      statistics: result.statistics,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getPayment(
    @CurrentUser() user: JwtUser,
    @Param() params: PaymentIdParamDto,
  ) {
    const result = await this.paymentsService.getPayment(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: PAYMENTS_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreatePaymentDto,
  ) {
    const result = await this.paymentsService.createPayment(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: PAYMENTS_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updatePayment(
    @CurrentUser() user: JwtUser,
    @Param() params: PaymentIdParamDto,
    @Body() dto: UpdatePaymentDto,
  ) {
    const result = await this.paymentsService.updatePayment(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: PAYMENTS_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deletePayment(
    @CurrentUser() user: JwtUser,
    @Param() params: PaymentIdParamDto,
  ) {
    const result = await this.paymentsService.deletePayment(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: PAYMENTS_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }
}
