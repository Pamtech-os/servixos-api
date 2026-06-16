import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Plan } from '../schemas/plan.schema';
import {
  SubscriptionTransaction,
  TransactionStatus,
  TransactionType,
  BillingInterval,
} from '../schemas/subscription-transaction.schema';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

@Injectable()
export class SubscriptionRepository {
  private readonly planModel: ReturnModelType<typeof Plan>;
  private readonly transactionModel: ReturnModelType<
    typeof SubscriptionTransaction
  >;

  constructor(@InjectConnection() connection: Connection) {
    this.planModel = getModelForClass(Plan, { existingConnection: connection });
    this.transactionModel = getModelForClass(SubscriptionTransaction, {
      existingConnection: connection,
    });
  }

  // ─── Plans ───────────────────────────────────────────────────────────────

  /** Returns all active plans sorted by display order. */
  async findAllActivePlans(): Promise<Plan[]> {
    return this.planModel
      .find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean<Plan[]>()
      .exec();
  }

  /** Finds a plan by its slug (starter / growth / pro). */
  async findPlanBySlug(slug: SubscriptionPlan): Promise<Plan | null> {
    return this.planModel.findOne({ slug, isActive: true }).lean<Plan>().exec();
  }

  /** Finds a plan by a Stripe Price ID (monthly or yearly). */
  async findPlanByPriceId(priceId: string): Promise<Plan | null> {
    return this.planModel
      .findOne({
        $or: [
          { stripePriceIdMonthly: priceId },
          { stripePriceIdYearly: priceId },
        ],
        isActive: true,
      })
      .lean<Plan>()
      .exec();
  }

  async upsertPlan(slug: SubscriptionPlan, data: Partial<Plan>): Promise<void> {
    await this.planModel.updateOne({ slug }, { $set: data }, { upsert: true });
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  async createTransaction(
    data: {
      businessId: Types.ObjectId;
      type: TransactionType;
      status: TransactionStatus;
      plan: SubscriptionPlan;
      billingInterval: BillingInterval;
      amountUsd?: number;
      currency?: string;
      stripeEventId?: string;
      stripeSubscriptionId?: string;
      stripeInvoiceId?: string;
      stripePaymentIntentId?: string;
    },
    session?: ClientSession,
  ): Promise<SubscriptionTransaction> {
    const [tx] = await this.transactionModel.create([data], { session });
    return tx.toObject() as SubscriptionTransaction;
  }

  async updateTransactionByEventId(
    stripeEventId: string,
    update: Partial<
      Pick<
        SubscriptionTransaction,
        'status' | 'amountUsd' | 'stripePaymentIntentId'
      >
    >,
  ): Promise<void> {
    await this.transactionModel.updateOne({ stripeEventId }, { $set: update });
  }

  async findTransactionsByBusiness(
    businessId: string,
    page: number,
    limit: number,
  ): Promise<{ data: SubscriptionTransaction[]; total: number }> {
    const filter = { businessId: new Types.ObjectId(businessId) };
    const [data, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<SubscriptionTransaction[]>()
        .exec(),
      this.transactionModel.countDocuments(filter),
    ]);
    return { data, total };
  }
}
