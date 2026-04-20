import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { User, UserModel } from './schemas/user.schema';

@Injectable()
export class UsersRepository {
  private readonly userModel: ReturnModelType<typeof User> = UserModel;
}
