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

export function paymentFailedTemplate(
  businessName: string,
  plan: SubscriptionPlan,
  gracePeriodEndsAt: string,
  amountDue: number,
  currency: string,
  appUrl: string,
): string {
  const graceDate = new Date(gracePeriodEndsAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const body = `
      <div style="background:linear-gradient(135deg,hsl(0,80%,55%) 0%,hsl(25,100%,55%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">⚠️</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Payment failed
        </h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;line-height:1.5;">
          Your <strong>${planLabel(plan)}</strong> subscription could not be renewed.
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:14px;color:hsl(220,25%,10%);font-weight:600;margin:0 0 8px;">Hi ${businessName},</p>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 20px;">
          We were unable to process your payment for the <strong>${planLabel(plan)} plan</strong>.
          You have a <strong>5-day grace period</strong> to resolve this before your account is locked.
        </p>

        <!-- Invoice summary -->
        <div style="border:1px solid hsl(220,15%,90%);border-radius:10px;padding:16px;margin:0 0 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:12px;color:hsl(220,10%,50%);padding-bottom:8px;">Plan</td>
              <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;text-align:right;padding-bottom:8px;">${planLabel(plan)}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:hsl(220,10%,50%);padding-bottom:8px;">Amount due</td>
              <td style="font-size:14px;color:hsl(0,80%,50%);font-weight:700;text-align:right;padding-bottom:8px;">${formatAmount(amountDue, currency)}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:hsl(220,10%,50%);">Grace period ends</td>
              <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;text-align:right;">${graceDate}</td>
            </tr>
          </table>
        </div>

        <div style="background:hsl(0,100%,97%);border-left:3px solid hsl(0,80%,55%);border-radius:8px;padding:14px 16px;margin:0 0 24px;">
          <p style="font-size:12px;color:hsl(0,70%,45%);margin:0;line-height:1.5;">
            <strong>Your account will be locked on ${graceDate}</strong> if payment is not received.
            All your data will remain safe and accessible once you settle the balance.
          </p>
        </div>

        <div style="text-align:center;">
          <a href="${appUrl}/settings/billing"
            style="background:linear-gradient(135deg,hsl(0,80%,55%) 0%,hsl(25,100%,55%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;display:inline-block;">
            Pay ${formatAmount(amountDue, currency)} now
          </a>
        </div>

        <p style="font-size:11px;color:hsl(220,10%,60%);text-align:center;margin:20px 0 0;line-height:1.5;">
          Need help? Contact our support team — your data is safe and waiting.
        </p>
      </div>`;

  return baseTemplate('Action required: Payment failed', body);
}
