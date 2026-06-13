import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { AdminRefreshToken } from '../schemas/admin-refresh-token.schema';

@Injectable()
export class AdminAuthRepository {
  private readonly tokenModel: ReturnModelType<typeof AdminRefreshToken>;

  constructor(@InjectConnection() connection: Connection) {
    this.tokenModel = getModelForClass(AdminRefreshToken, {
      existingConnection: connection,
    });
  }

  async createRefreshToken(data: {
    adminId: Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AdminRefreshToken> {
    const [token] = await this.tokenModel.create([data]);
    return token.toObject() as AdminRefreshToken;
  }

  async findValidToken(tokenHash: string): Promise<AdminRefreshToken | null> {
    return this.tokenModel
      .findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } })
      .lean<AdminRefreshToken>()
      .exec();
  }

  async revokeToken(tokenHash: string): Promise<void> {
    await this.tokenModel.updateOne(
      { tokenHash },
      { $set: { revokedAt: new Date() } },
    );
  }

  async revokeAllForAdmin(adminId: Types.ObjectId): Promise<void> {
    await this.tokenModel.updateMany(
      { adminId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
}
