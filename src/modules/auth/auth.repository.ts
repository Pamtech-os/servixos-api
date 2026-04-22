import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Types } from 'mongoose';
import {
  RefreshToken,
  RefreshTokenModel,
} from './schemas/refresh-token.schema';

@Injectable()
export class AuthRepository {
  private readonly refreshTokenModel: ReturnModelType<typeof RefreshToken> =
    RefreshTokenModel;

  async createRefreshToken(
    data: {
      userId: Types.ObjectId;
      businessId: Types.ObjectId;
      tokenHash: string;
      expiresAt: Date;
    },
    session?: ClientSession,
  ): Promise<RefreshToken> {
    const [token] = await this.refreshTokenModel.create([data], { session });
    return token.toObject() as RefreshToken;
  }

  async findValidRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.refreshTokenModel
      .findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .lean<RefreshToken>()
      .exec();
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.refreshTokenModel.updateOne(
      { tokenHash },
      { $set: { revokedAt: new Date() } },
    );
  }

  async revokeAllUserRefreshTokens(userId: Types.ObjectId): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
}
