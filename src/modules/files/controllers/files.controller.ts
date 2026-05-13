import {
  Controller,
  Delete,
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
import { FileIdParamDto } from '../dto/file-id-param.dto';
import { FilesService } from '../services/files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * Generic upload endpoint — accepts any file and returns the storage URL +
   * publicId. Callers use the returned values when creating task attachments,
   * client files, or message attachments via their respective JSON endpoints.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadFile(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.filesService.uploadFile(user.businessId, file);
    if (result instanceof HttpException) throw result;

    return {
      message: FILES_MESSAGES.SUCCESS.UPLOADED,
      data: result,
    };
  }

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
