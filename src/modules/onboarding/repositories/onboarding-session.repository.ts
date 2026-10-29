import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import {
  ChatTurn,
  OnboardingSession,
  StartingPoint,
} from '../schemas/onboarding-session.schema';

@Injectable()
export class OnboardingSessionRepository {
  private readonly model: ReturnModelType<typeof OnboardingSession>;

  constructor(@InjectConnection() connection: Connection) {
    this.model = getModelForClass(OnboardingSession, {
      existingConnection: connection,
    });
  }

  /** Atomic upsert so concurrent first requests never create duplicate sessions. */
  async findOrCreateByUserId(userId: string): Promise<OnboardingSession> {
    return this.model
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $setOnInsert: { userId: new Types.ObjectId(userId) } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<OnboardingSession>()
      .orFail()
      .exec();
  }

  async findByUserId(userId: string): Promise<OnboardingSession | null> {
    return this.model
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean<OnboardingSession>()
      .exec();
  }

  /** Replaces one profile section (dot-path `profile.<section>`). */
  async setSection(
    userId: string,
    section: string,
    value: unknown,
  ): Promise<OnboardingSession | null> {
    return this.model
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $set: { [`profile.${section}`]: value } },
        { returnDocument: 'after' },
      )
      .lean<OnboardingSession>()
      .exec();
  }

  async setSectionStatus(
    userId: string,
    section: string,
    status: string,
  ): Promise<OnboardingSession | null> {
    return this.model
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          [`profile.${section}`]: { $exists: true },
        },
        { $set: { [`profile.${section}.status`]: status } },
        { returnDocument: 'after' },
      )
      .lean<OnboardingSession>()
      .exec();
  }

  async setStartingPoint(
    userId: string,
    startingPoint: StartingPoint,
  ): Promise<void> {
    await this.model
      .updateOne(
        { userId: new Types.ObjectId(userId) },
        { $set: { startingPoint } },
      )
      .exec();
  }

  /** Appends chat turns, keeping only the most recent `maxTurns` ($slice caps unbounded growth). */
  async appendTurns(
    userId: string,
    turns: ChatTurn[],
    maxTurns: number,
  ): Promise<void> {
    await this.model
      .updateOne(
        { userId: new Types.ObjectId(userId) },
        { $push: { messages: { $each: turns, $slice: -maxTurns } } },
      )
      .exec();
  }
}
