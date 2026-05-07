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
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listClients(
    @CurrentUser() user: JwtUser,
    @Query() query: QueryClientsDto,
  ) {
    const result = await this.clientsService.listClients(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENTS_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getClient(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.clientsService.getClient(id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENTS_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createClient(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateClientDto,
  ) {
    const result = await this.clientsService.createClient(user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENTS_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateClient(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    const result = await this.clientsService.updateClient(
      id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENTS_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteClient(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.clientsService.deleteClient(id, user.businessId);
    if (result instanceof HttpException) throw result;

    return { message: CLIENTS_MESSAGES.SUCCESS.DELETED };
  }
}
