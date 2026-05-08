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
import { ListClientFilesDto } from '../dto/list-client-files.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientFilesService } from '../services/client-files.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/files')
export class ClientFilesController {
  constructor(private readonly filesService: ClientFilesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listFiles(
    @CurrentClient() client: ClientRequestUser,
    @Query() query: ListClientFilesDto,
  ) {
    const result = await this.filesService.listFiles(
      client.businessId,
      client.clientId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.FILE.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id/download')
  @HttpCode(HttpStatus.OK)
  async downloadFile(
    @CurrentClient() client: ClientRequestUser,
    @Param('id') id: string,
  ) {
    const result = await this.filesService.generateDownload(
      client.businessId,
      client.clientId,
      id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.FILE.SUCCESS.DOWNLOAD_URL_READY,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
