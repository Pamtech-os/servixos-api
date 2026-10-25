import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { CreateAnnouncementDto } from '../dto/create-announcement.dto';
import { CreateTeamMessageDto } from '../dto/create-team-message.dto';
import { ListMessagesDto } from '../dto/list-messages.dto';
import { MessagingGateway } from '../messaging.gateway';
import { MessagingService } from '../services/messaging.service';

@Controller('team')
export class TeamMessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get('messages')
  @HttpCode(HttpStatus.OK)
  async listTeamMessages(
    @CurrentUser() user: JwtUser,
    @Query() query: ListMessagesDto,
  ) {
    const pagination = resolvePagination(query.page, query.limit);
    const result = await this.messagingService.listTeamMessages(
      user.businessId,
      pagination,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: MESSAGING_MESSAGES.SUCCESS.TEAM_MESSAGES_RETRIEVED,
      data: result.data,
      meta: buildMeta(pagination.page, pagination.limit, result.total),
    };
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  async createTeamMessage(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTeamMessageDto,
  ) {
    const result = await this.messagingService.createTeamMessage({
      businessId: user.businessId,
      userId: user.sub,
      content: dto.content,
    });
    if (result instanceof HttpException) throw result;

    this.messagingGateway.emitTeamMessage(user.businessId, result);

    return {
      message: MESSAGING_MESSAGES.SUCCESS.TEAM_MESSAGE_SENT,
      data: result,
    };
  }

  @Get('announcements')
  @HttpCode(HttpStatus.OK)
  async listAnnouncements(
    @CurrentUser() user: JwtUser,
    @Query() query: ListMessagesDto,
  ) {
    const pagination = resolvePagination(query.page, query.limit);
    const result = await this.messagingService.listAnnouncements(
      user.businessId,
      pagination,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: MESSAGING_MESSAGES.SUCCESS.ANNOUNCEMENTS_RETRIEVED,
      data: result.data,
      meta: buildMeta(pagination.page, pagination.limit, result.total),
    };
  }

  @Post('announcements')
  @HttpCode(HttpStatus.CREATED)
  async createAnnouncement(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateAnnouncementDto,
  ) {
    const result = await this.messagingService.createAnnouncement({
      businessId: user.businessId,
      userId: user.sub,
      title: dto.title,
      description: dto.description,
    });
    if (result instanceof HttpException) throw result;

    this.messagingGateway.emitAnnouncement(user.businessId, result);

    return {
      message: MESSAGING_MESSAGES.SUCCESS.ANNOUNCEMENT_CREATED,
      data: result,
    };
  }
}
