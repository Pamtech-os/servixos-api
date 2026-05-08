import {
  Body,
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
import { IdParamDto } from '../dto/id-param.dto';
import { ListClientContractsDto } from '../dto/list-client-contracts.dto';
import { SignContractDto } from '../dto/sign-contract.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientContractsService } from '../services/client-contracts.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/contracts')
export class ClientContractsController {
  constructor(private readonly contractsService: ClientContractsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listContracts(
    @CurrentClient() client: ClientRequestUser,
    @Query() query: ListClientContractsDto,
  ) {
    const result = await this.contractsService.listContracts(
      client.businessId,
      client.clientId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.CONTRACT.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getContract(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: IdParamDto,
  ) {
    const result = await this.contractsService.getContract(
      client.businessId,
      client.clientId,
      params.id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.CONTRACT.SUCCESS.FOUND,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':id/sign')
  @HttpCode(HttpStatus.OK)
  async signContract(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: IdParamDto,
    @Body() _dto: SignContractDto,
  ) {
    const result = await this.contractsService.signContract(
      client.businessId,
      client.clientId,
      client.userId,
      params.id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.CONTRACT.SUCCESS.SIGNED,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
