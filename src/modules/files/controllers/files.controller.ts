import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { FileIdParamDto } from '../dto/file-id-param.dto';
import { FilesService } from '../services/files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get(':fileId')
  @HttpCode(HttpStatus.OK)
  async getFile(@CurrentUser() user: JwtUser, @Param() params: FileIdParamDto) {
    const result = await this.filesService.getFileUrl(
      params.fileId,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: FILES_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @CurrentUser() user: JwtUser,
    @Param() params: FileIdParamDto,
  ) {
    const result = await this.filesService.deleteFile(
      params.fileId,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: FILES_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }
}
