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

export function trialPaymentFailedTemplate(
  businessName: string,
  plan: SubscriptionPlan,
  amountDue: number,
  currency: string,
  appUrl: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(0,70%,40%) 0%,hsl(0,60%,30%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">🔒</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Your free trial has ended
        </h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">
          ${planLabel(plan)} plan · Payment could not be collected
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:14px;color:hsl(220,25%,10%);font-weight:600;margin:0 0 8px;">Hi ${businessName},</p>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 20px;">
          Your 7-day free trial on the <strong>${planLabel(plan)} plan</strong> has ended and we were
          unable to collect your first payment. Your account has been locked until the balance is settled —
          your data is 100% safe and will be fully restored the moment you pay.
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
              <td style="font-size:12px;color:hsl(220,10%,50%);">Status</td>
              <td style="font-size:12px;color:hsl(0,70%,45%);font-weight:700;text-align:right;">Account locked</td>
            </tr>
          </table>
        </div>

        <div style="background:hsl(0,100%,97%);border-left:3px solid hsl(0,80%,55%);border-radius:8px;padding:14px 16px;margin:0 0 24px;">
          <p style="font-size:12px;color:hsl(0,70%,45%);margin:0;line-height:1.5;">
            Stripe will automatically retry the charge on your saved card. You can also pay manually from
            your billing settings to restore access immediately.
          </p>
        </div>

        <div style="text-align:center;">
          <a href="${appUrl}/settings/billing"
            style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;display:inline-block;">
            Pay ${formatAmount(amountDue, currency)} to restore access
          </a>
        </div>

        <p style="font-size:11px;color:hsl(220,10%,60%);text-align:center;margin:20px 0 0;line-height:1.5;">
          Need help? Contact our support team — your data is safe and waiting for you.
        </p>
      </div>`;

  return baseTemplate('Your free trial has ended — payment required', body);
}
