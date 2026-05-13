import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { AttachFileDto } from '../dto/attach-file.dto';
import { ClientFilesParamDto } from '../dto/client-files-param.dto';
import { FilesService } from '../services/files.service';

@Controller('clients/:clientId/files')
export class ClientFilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listClientFiles(
    @CurrentUser() user: JwtUser,
    @Param() params: ClientFilesParamDto,
  ) {
    const result = await this.filesService.listClientFiles(
      user.businessId,
      params.clientId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: FILES_MESSAGES.SUCCESS.RETRIEVED,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async attachClientFile(
    @CurrentUser() user: JwtUser,
    @Param() params: ClientFilesParamDto,
    @Body() dto: AttachFileDto,
  ) {
    const result = await this.filesService.attachClientFile(
      user.businessId,
      params.clientId,
      user.sub,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: FILES_MESSAGES.SUCCESS.UPLOADED,
      data: result,
    };
  }
}
