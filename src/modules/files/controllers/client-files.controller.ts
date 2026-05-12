import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
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
  @UseInterceptors(FileInterceptor('file'))
  async uploadClientFile(
    @CurrentUser() user: JwtUser,
    @Param() params: ClientFilesParamDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.filesService.uploadClientFile(
      user.businessId,
      params.clientId,
      user.sub,
      file,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: FILES_MESSAGES.SUCCESS.UPLOADED,
      data: result,
    };
  }
}
