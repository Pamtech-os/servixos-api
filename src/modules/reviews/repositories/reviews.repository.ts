import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Review } from '../schemas/review.schema';

interface ListFilters {
  rating?: number;
}

type ReviewWithMetadata = Review & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

@Injectable()
export class ReviewsRepository {
  private readonly reviewModel: ReturnModelType<typeof Review>;

  constructor(@InjectConnection() connection: Connection) {
    this.reviewModel = getModelForClass(Review, {
      existingConnection: connection,
    });
  }

  async findByJobId(
    jobId: Types.ObjectId,
    businessId: Types.ObjectId,
  ): Promise<Review | null> {
    const row = await this.reviewModel
      .findOne({ jobId, businessId })
      .lean<ReviewWithMetadata>()
      .exec();
    return this.sanitize(row);
  }

  async create(data: Partial<Review>): Promise<Review> {
    const [doc] = await this.reviewModel.create([data]);
    return this.sanitize(doc.toObject() as ReviewWithMetadata) as Review;
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListFilters,
    pagination: { skip: number; limit: number },
  ): Promise<{ data: Review[]; total: number }> {
    const query: Record<string, unknown> = { businessId };
    if (filters.rating !== undefined) query['rating'] = filters.rating;

    const [data, total] = await Promise.all([
      this.reviewModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ReviewWithMetadata[]>()
        .exec(),
      this.reviewModel.countDocuments(query).exec(),
    ]);

    return { data: data.map((r) => this.sanitize(r)!), total };
  }

  async getStats(businessId: Types.ObjectId): Promise<{
    average: number;
    count: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  }> {
    const [summary] = await this.reviewModel.aggregate<{
      average: number;
      count: number;
    }>([
      { $match: { businessId } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          average: { $round: ['$average', 1] },
          count: 1,
        },
      },
    ]);

    if (!summary) {
      return {
        average: 0,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    // Hash map for O(1) lookups when building the distribution object
    const distRows = await this.reviewModel.aggregate<{
      rating: number;
      count: number;
    }>([
      { $match: { businessId } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $project: { _id: 0, rating: '$_id', count: 1 } },
    ]);
    const distMap = new Map(distRows.map((r) => [r.rating, r.count]));

    return {
      average: summary.average,
      count: summary.count,
      distribution: {
        1: distMap.get(1) ?? 0,
        2: distMap.get(2) ?? 0,
        3: distMap.get(3) ?? 0,
        4: distMap.get(4) ?? 0,
        5: distMap.get(5) ?? 0,
      } as Record<1 | 2 | 3 | 4 | 5, number>,
    };
  }

  async countForBusiness(businessId: Types.ObjectId): Promise<number> {
    return this.reviewModel.countDocuments({ businessId }).exec();
  }

  private sanitize(row: ReviewWithMetadata | null): Review | null {
    if (!row) return null;
    const { createdAt: _ca, updatedAt: _ua, __v: _v, ...safe } = row;
    return safe as Review;
  }
}
