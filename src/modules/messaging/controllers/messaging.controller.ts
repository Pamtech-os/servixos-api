import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { MessagingGateway } from '../messaging.gateway';
import { ClientIdParamDto } from '../dto/client-id-param.dto';
import { ListMessagesDto } from '../dto/list-messages.dto';
import { MarkReadDto } from '../dto/mark-read.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { MessagingService } from '../services/messaging.service';

@Controller('messages')
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  async listConversations(
    @CurrentUser() user: JwtUser,
    @Query() query: ListMessagesDto,
  ) {
    const pagination = resolvePagination(query.page, query.limit);
    const result = await this.messagingService.getConversations(
      user.businessId,
      pagination,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: MESSAGING_MESSAGES.SUCCESS.CONVERSATIONS_RETRIEVED,
      data: result.data,
      meta: buildMeta(pagination.page, pagination.limit, result.total),
    };
  }

  @Get(':clientId')
  @HttpCode(HttpStatus.OK)
  async listMessages(
    @CurrentUser() user: JwtUser,
    @Param() params: ClientIdParamDto,
    @Query() query: ListMessagesDto,
  ) {
    const pagination = resolvePagination(query.page, query.limit);
    const result = await this.messagingService.getMessages(
      user.businessId,
      params.clientId,
      pagination,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: MESSAGING_MESSAGES.SUCCESS.MESSAGES_RETRIEVED,
      data: result.data,
      meta: buildMeta(pagination.page, pagination.limit, result.total),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(@CurrentUser() user: JwtUser, @Body() dto: SendMessageDto) {
    const result = await this.messagingService.sendMessageFromBusiness({
      businessId: user.businessId,
      userId: user.sub,
      clientId: dto.clientId,
      content: dto.content,
      attachmentUrl: dto.attachmentUrl,
      publicId: dto.publicId,
      mimeType: dto.mimeType,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
    });
    if (result instanceof HttpException) throw result;

    this.messagingGateway.emitMessageReceivedToConversation(
      user.businessId,
      dto.clientId,
      result,
    );

    return {
      message: MESSAGING_MESSAGES.SUCCESS.MESSAGE_SENT,
      data: result,
    };
  }

  @Patch('read')
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentUser() user: JwtUser, @Body() dto: MarkReadDto) {
    const result = await this.messagingService.markMessagesReadFromBusiness({
      businessId: user.businessId,
      userId: user.sub,
      clientId: dto.clientId,
      upToMessageId: dto.upToMessageId,
    });
    if (result instanceof HttpException) throw result;

    this.messagingGateway.emitMessageReadToConversation(
      user.businessId,
      dto.clientId,
      result.upToMessageId,
      result.readAt,
      result.readBy,
    );

    return {
      message: MESSAGING_MESSAGES.SUCCESS.MESSAGES_MARKED_READ,
      data: null,
    };
  }

  @Post('upload-attachment')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadAttachment(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.messagingService.uploadAttachment(
      file,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: MESSAGING_MESSAGES.SUCCESS.MESSAGE_SENT,
      data: result,
    };
  }
}
