import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CreateReviewDto } from '../../reviews/dto/create-review.dto';
import { CurrentClient } from '../decorators/current-client.decorator';
import { IdParamDto } from '../dto/id-param.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientReviewsService } from '../services/client-reviews.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/jobs')
export class ClientReviewsController {
  constructor(private readonly clientReviewsService: ClientReviewsService) {}

  @Post(':id/review')
  @HttpCode(HttpStatus.CREATED)
  async submitReview(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: IdParamDto,
    @Body() dto: CreateReviewDto,
  ) {
    const result = await this.clientReviewsService.submitReview(
      client.businessId,
      client.clientId,
      params.id,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.REVIEW.SUCCESS.CREATED,
      data: result,
    };
  }

  @Get(':id/review')
  @HttpCode(HttpStatus.OK)
  async getReview(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: IdParamDto,
  ) {
    const result = await this.clientReviewsService.getReview(
      client.businessId,
      client.clientId,
      params.id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.REVIEW.SUCCESS.FOUND,
      data: result,
    };
  }
}
