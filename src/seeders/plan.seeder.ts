import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan } from '../modules/business/schemas/business.schema';
import { SubscriptionRepository } from '../modules/subscription/repositories/subscription.repository';
import {
  getFeaturesForPlan,
  PLAN_LIMITS,
} from '../common/constants/subscription-features.constants';
@Injectable()
export class PlanSeeder implements OnModuleInit {
  private readonly logger = new Logger(PlanSeeder.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  private async seed(): Promise<void> {
    const plans: Array<{
      slug: SubscriptionPlan;
      name: string;
      description: string;
      monthlyPriceUsd: number;
      yearlyPriceUsd: number;
      stripePriceIdMonthly: string;
      stripePriceIdYearly: string;
      stripeProductId: string;
      displayOrder: number;
      isPopular: boolean;
    }> = [
      {
        slug: SubscriptionPlan.STARTER,
        name: 'Starter',
        description:
          'Launch with the essentials — guided business setup, job tracking, invoicing, and client management with built-in AI assistance.',
        monthlyPriceUsd: 2900,
        yearlyPriceUsd: 27840, // $23.20/mo × 12 (~20% discount)
        stripePriceIdMonthly:
          this.config.get<string>('STRIPE_PRICE_STARTER_MONTHLY') ?? '',
        stripePriceIdYearly:
          this.config.get<string>('STRIPE_PRICE_STARTER_YEARLY') ?? '',
        stripeProductId:
          this.config.get<string>('STRIPE_PRODUCT_STARTER') ?? '',
        displayOrder: 0,
        isPopular: false,
      },
      {
        slug: SubscriptionPlan.GROWTH,
        name: 'Growth',
        description:
          'Built for growing teams — unlock more automation, smarter pricing and contracts, and higher limits to run more jobs and invoices.',
        monthlyPriceUsd: 7900,
        yearlyPriceUsd: 75840, // $63.20/mo × 12 (~20% discount)
        stripePriceIdMonthly:
          this.config.get<string>('STRIPE_PRICE_GROWTH_MONTHLY') ?? '',
        stripePriceIdYearly:
          this.config.get<string>('STRIPE_PRICE_GROWTH_YEARLY') ?? '',
        stripeProductId: this.config.get<string>('STRIPE_PRODUCT_GROWTH') ?? '',
        displayOrder: 1,
        isPopular: true,
      },
      {
        slug: SubscriptionPlan.PRO,
        name: 'Pro',
        description:
          'For scale and operations — unlimited usage, advanced AI support, and streamlined workflows built for high-volume teams.',
        monthlyPriceUsd: 10000,
        yearlyPriceUsd: 96000, // $80.00/mo × 12 (~20% discount)
        stripePriceIdMonthly:
          this.config.get<string>('STRIPE_PRICE_PRO_MONTHLY') ?? '',
        stripePriceIdYearly:
          this.config.get<string>('STRIPE_PRICE_PRO_YEARLY') ?? '',
        stripeProductId: this.config.get<string>('STRIPE_PRODUCT_PRO') ?? '',
        displayOrder: 2,
        isPopular: false,
      },
    ];

    for (const plan of plans) {
      const limits = PLAN_LIMITS[plan.slug];
      const features = getFeaturesForPlan(plan.slug);

      await this.subscriptionRepository.upsertPlan(plan.slug, {
        ...plan,
        features,
        limits: {
          maxClients: limits.maxClients === Infinity ? -1 : limits.maxClients,
          maxJobsPerMonth:
            limits.maxJobsPerMonth === Infinity ? -1 : limits.maxJobsPerMonth,
          maxInvoicesPerMonth:
            limits.maxInvoicesPerMonth === Infinity
              ? -1
              : limits.maxInvoicesPerMonth,
          maxEmployees:
            limits.maxEmployees === Infinity ? -1 : limits.maxEmployees,
          maxAiSuggestions:
            limits.maxAiSuggestions === Infinity ? -1 : limits.maxAiSuggestions,
          activityLogDays: limits.activityLogDays,
        },
        isActive: true,
      });
    }

    this.logger.log('Plans seeded successfully');
  }
}
