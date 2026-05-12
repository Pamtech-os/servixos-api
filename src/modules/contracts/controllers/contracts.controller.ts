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
import { CONTRACTS_MESSAGES } from 'src/common/constants/messages/contracts.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ContractIdParamDto } from '../dto/contract-id-param.dto';
import { CreateContractDto } from '../dto/create-contract.dto';
import { ListContractsDto } from '../dto/list-contracts.dto';
import { SendContractDto } from '../dto/send-contract.dto';
import { UpdateContractDto } from '../dto/update-contract.dto';
import { ContractsService } from '../services/contracts.service';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listContracts(
    @CurrentUser() user: JwtUser,
    @Query() query: ListContractsDto,
  ) {
    const result = await this.contractsService.listContracts(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CONTRACTS_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getContract(
    @CurrentUser() user: JwtUser,
    @Param() params: ContractIdParamDto,
  ) {
    const result = await this.contractsService.getContract(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CONTRACTS_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createContract(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateContractDto,
  ) {
    const result = await this.contractsService.createContract(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CONTRACTS_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateContract(
    @CurrentUser() user: JwtUser,
    @Param() params: ContractIdParamDto,
    @Body() dto: UpdateContractDto,
  ) {
    const result = await this.contractsService.updateContract(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CONTRACTS_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteContract(
    @CurrentUser() user: JwtUser,
    @Param() params: ContractIdParamDto,
  ) {
    const result = await this.contractsService.deleteContract(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CONTRACTS_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }

  @Get(':id/pdf')
  @HttpCode(HttpStatus.OK)
  async getContractPdf(
    @CurrentUser() user: JwtUser,
    @Param() params: ContractIdParamDto,
  ) {
    const result = await this.contractsService.getContractPdf(
      params.id,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CONTRACTS_MESSAGES.SUCCESS.PDF_READY,
      data: result,
    };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async sendContract(
    @CurrentUser() user: JwtUser,
    @Param() params: ContractIdParamDto,
    @Body() dto: SendContractDto,
  ) {
    const result = await this.contractsService.sendContract(
      params.id,
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CONTRACTS_MESSAGES.SUCCESS.SENT,
      data: result,
    };
  }
}
