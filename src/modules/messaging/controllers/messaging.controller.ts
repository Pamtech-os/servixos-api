import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { MessagingService } from '../services/messaging.service';
import { ListMessagesDto } from '../dto/list-messages.dto';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { resolvePagination, buildMeta } from 'src/common/utils/pagination.util';

@Controller('messages')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('conversations')
  async listConversations(
    @CurrentUser() user: JwtUser,
    @Query() query: ListMessagesDto,
  ) {
    const pagination = resolvePagination(query.page, query.limit);
    const { data, total } = await this.messagingService.getConversations(
      user.businessId,
      pagination,
    );
    return {
      message: MESSAGING_MESSAGES.SUCCESS.MESSAGES_RETRIEVED,
      data,
      meta: buildMeta(pagination.page, pagination.limit, total),
    };
  }

  @Get(':clientId')
  async listMessages(
    @CurrentUser() user: JwtUser,
    @Param('clientId') clientId: string,
    @Query() query: ListMessagesDto,
  ) {
    const pagination = resolvePagination(query.page, query.limit);
    const { data, total } = await this.messagingService.getMessages(
      user.businessId,
      clientId,
      pagination,
    );
    return {
      message: MESSAGING_MESSAGES.SUCCESS.MESSAGES_RETRIEVED,
      data,
      meta: buildMeta(pagination.page, pagination.limit, total),
    };
  }

  @Post('upload-attachment')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadAttachment(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.messagingService.uploadAttachment(
      file,
      user.businessId,
    );
    return {
      message: MESSAGING_MESSAGES.SUCCESS.MESSAGE_SENT,
      data: result,
    };
  }
}
