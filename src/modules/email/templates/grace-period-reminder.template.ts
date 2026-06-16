import { baseTemplate } from './base.template';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

function planLabel(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export function gracePeriodReminderTemplate(
  businessName: string,
  plan: SubscriptionPlan,
  daysLeft: number,
  amountDue: number,
  currency: string,
  appUrl: string,
): string {
  const urgencyColor = daysLeft <= 1 ? 'hsl(0,80%,55%)' : 'hsl(38,95%,50%)';
  const gradientStart = daysLeft <= 1 ? 'hsl(0,80%,55%)' : 'hsl(38,95%,50%)';
  const gradientEnd = daysLeft <= 1 ? 'hsl(25,100%,55%)' : 'hsl(30,100%,55%)';

  const body = `
      <div style="background:linear-gradient(135deg,${gradientStart} 0%,${gradientEnd} 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">${daysLeft <= 1 ? '🚨' : '⏰'}</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          ${daysLeft} day${daysLeft === 1 ? '' : 's'} left — pay now to keep access
        </h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;line-height:1.5;">
          Grace period • ${planLabel(plan)} plan
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:14px;color:hsl(220,25%,10%);font-weight:600;margin:0 0 8px;">Hi ${businessName},</p>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 20px;">
          We still haven't been able to collect payment for your <strong>${planLabel(plan)} plan</strong>.
          You have <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> remaining before your account is locked.
        </p>

        <!-- Outstanding balance -->
        <div style="border:2px solid ${urgencyColor};border-radius:10px;padding:16px;margin:0 0 20px;text-align:center;">
          <p style="font-size:12px;color:hsl(220,10%,50%);margin:0 0 4px;">Outstanding balance</p>
          <p style="font-size:28px;font-weight:700;color:${urgencyColor};margin:0;">${formatAmount(amountDue, currency)}</p>
        </div>

        <div style="background:hsl(0,100%,97%);border-radius:8px;padding:14px 16px;margin:0 0 24px;">
          <p style="font-size:12px;color:hsl(0,70%,45%);margin:0;line-height:1.5;">
            ${
              daysLeft === 1
                ? '<strong>This is your final reminder.</strong> Your account will be locked tomorrow if payment is not received.'
                : `Your account will be <strong>locked in ${daysLeft} days</strong> if this balance isn't settled. All your data stays safe.`
            }
          </p>
        </div>

        <div style="text-align:center;">
          <a href="${appUrl}/settings/billing"
            style="background:linear-gradient(135deg,${gradientStart} 0%,${gradientEnd} 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;display:inline-block;">
            Pay ${formatAmount(amountDue, currency)} to restore access
          </a>
        </div>

        <p style="font-size:11px;color:hsl(220,10%,60%);text-align:center;margin:20px 0 0;line-height:1.5;">
          Need help? Contact support — your data is safe and waiting.
        </p>
      </div>`;

  return baseTemplate(
    `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your grace period`,
    body,
  );
}
