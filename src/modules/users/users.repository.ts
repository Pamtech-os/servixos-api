import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Types } from 'mongoose';
import { User, UserModel } from './schemas/user.schema';

@Injectable()
export class UsersRepository {
  private readonly userModel: ReturnModelType<typeof User> = UserModel;

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
