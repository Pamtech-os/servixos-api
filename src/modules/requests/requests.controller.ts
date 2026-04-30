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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { ApiKeyGuard } from 'src/common/guards/api-key.guard';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  async listRequests(
    @CurrentUser() user: JwtUser,
    @Query() query: ListRequestsDto,
  ) {
    const result = await this.requestsService.listRequests(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;
    return {
      message: REQUESTS_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  async getRequest(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.requestsService.getRequest(id, user.businessId);
    if (result instanceof HttpException) throw result;
    return { message: REQUESTS_MESSAGES.SUCCESS.FOUND, data: result };
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRequest(
    @Body() dto: CreateRequestDto,
    @Query('businessSlug') businessSlug?: string,
    @Query('businessId') businessId?: string,
  ) {
    const result = await this.requestsService.createRequest(
      dto,
      businessSlug,
      businessId,
    );
    if (result instanceof HttpException) throw result;
    return { message: REQUESTS_MESSAGES.SUCCESS.CREATED, data: result };
  }

  @Patch(':id')
  async updateRequest(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    const result = await this.requestsService.updateRequest(
      id,
      user.businessId,
      dto,
      user.sub,
    );
    if (result instanceof HttpException) throw result;
    return { message: REQUESTS_MESSAGES.SUCCESS.UPDATED, data: result };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteRequest(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.requestsService.deleteRequest(
      id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;
    return { message: REQUESTS_MESSAGES.SUCCESS.DELETED, data: null };
  }
}
