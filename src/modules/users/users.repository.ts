import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersRepository {
  private readonly userModel: ReturnModelType<typeof User>;

  constructor(@InjectConnection() connection: Connection) {
    this.userModel = getModelForClass(User, { existingConnection: connection });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email, deletedAt: null })
      .lean<User>()
      .exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).lean<User>().exec();
  }

  async create(data: Partial<User>, session?: ClientSession): Promise<User> {
    const [user] = await this.userModel.create([data], { session });
    return user.toObject() as User;
  }

  async updateById(
    id: string | Types.ObjectId,
    update: Partial<User>,
    session?: ClientSession,
  ): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(id, { $set: update }, { new: true, session })
      .lean<User>()
      .exec();
  }

  async findByPasswordResetToken(tokenHash: string): Promise<User | null> {
    return this.userModel
      .findOne({
        passwordResetToken: tokenHash,
        passwordResetTokenExpiry: { $gt: new Date() },
        deletedAt: null,
      })
      .lean<User>()
      .exec();
  }
}
