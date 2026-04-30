import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { BusinessRepository } from '../business/business.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestsRepository } from './requests.repository';
import {
  RequestStatus,
  ServiceRequest,
} from './schemas/service-request.schema';

export interface PaginatedRequests {
  data: ServiceRequest[];
  meta: ReturnType<typeof buildMeta>;
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly requestsRepository: RequestsRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
  ) {}

  async listRequests(
    businessId: string,
    dto: ListRequestsDto,
  ): Promise<PaginatedRequests | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const { data, total } = await this.requestsRepository.findAll(
        new Types.ObjectId(businessId),
        { status: dto.status, search: dto.search },
        pagination,
      );
      return {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `listRequests: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getRequest(
    id: string,
    businessId: string,
  ): Promise<
    ServiceRequest | NotFoundException | InternalServerErrorException
  > {
    try {
      const request = await this.requestsRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );
      if (!request)
        return new NotFoundException(REQUESTS_MESSAGES.ERROR.NOT_FOUND);
      return request;
    } catch (error) {
      this.logger.error(
        `getRequest: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createRequest(
    dto: CreateRequestDto,
    businessSlug?: string,
    businessId?: string,
  ): Promise<
    | ServiceRequest
    | BadRequestException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      let resolvedBusinessId: Types.ObjectId;

      if (businessId) {
        const business = await this.businessRepository.findById(businessId);
        if (!business || business.deletedAt) {
          return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
        }
        resolvedBusinessId = business._id;
      } else if (businessSlug) {
        const business =
          await this.businessRepository.findBySubdomain(businessSlug);
        if (!business) {
          return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
        }
        resolvedBusinessId = business._id;
      } else {
        return new BadRequestException(
          'businessSlug or businessId query param is required',
        );
      }

      const request = await this.requestsRepository.create({
        businessId: resolvedBusinessId,
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
        service: dto.service,
        requestedDate: new Date(dto.requestedDate),
        message: dto.message,
      });

      return request;
    } catch (error) {
      this.logger.error(
        `createRequest: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateRequest(
    id: string,
    businessId: string,
    dto: UpdateRequestDto,
    actionedBy: string,
  ): Promise<
    | ServiceRequest
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.requestsRepository.findById(id, bId);

      if (!existing) {
        return new NotFoundException(REQUESTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (dto.status && existing.status !== RequestStatus.PENDING) {
        return new BadRequestException(
          REQUESTS_MESSAGES.ERROR.ALREADY_ACTIONED,
        );
      }

      if (dto.status === RequestStatus.ACCEPTED) {
        return this.acceptRequest(id, bId, existing, dto, actionedBy);
      }

      const updated = await this.requestsRepository.updateById(id, bId, {
        ...(dto.status && {
          status: dto.status,
          actionedAt: new Date(),
          actionedBy: new Types.ObjectId(actionedBy),
        }),
        ...(dto.quotedPrice !== undefined && { quotedPrice: dto.quotedPrice }),
      });

      return updated!;
    } catch (error) {
      this.logger.error(
        `updateRequest: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteRequest(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const deleted = await this.requestsRepository.softDelete(
        id,
        new Types.ObjectId(businessId),
      );
      if (!deleted)
        return new NotFoundException(REQUESTS_MESSAGES.ERROR.NOT_FOUND);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteRequest: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async acceptRequest(
    id: string,
    bId: Types.ObjectId,
    existing: ServiceRequest,
    dto: UpdateRequestDto,
    actionedBy: string,
  ): Promise<ServiceRequest | InternalServerErrorException> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      let client = await this.clientsRepository.findByEmail(
        existing.clientEmail,
        bId,
      );

      if (!client) {
        client = await this.clientsRepository.create(
          {
            businessId: bId,
            name: existing.clientName,
            email: existing.clientEmail,
            phone: existing.clientPhone,
          },
          session,
        );
      }

      const updated = await this.requestsRepository.updateById(
        id,
        bId,
        {
          status: RequestStatus.ACCEPTED,
          clientId: client._id,
          actionedAt: new Date(),
          actionedBy: new Types.ObjectId(actionedBy),
          ...(dto.quotedPrice !== undefined && {
            quotedPrice: dto.quotedPrice,
          }),
        },
        session,
      );

      await session.commitTransaction();
      return updated!;
    } catch (err) {
      await session.abortTransaction();
      this.logger.error(
        `acceptRequest: transaction failed [id=${id}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }
}
