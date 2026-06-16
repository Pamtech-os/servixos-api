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

export function actionRequiredTemplate(
  businessName: string,
  plan: SubscriptionPlan,
  amountDue: number,
  currency: string,
  appUrl: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,55%) 0%,hsl(270,70%,55%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">🔐</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Payment authentication required
        </h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">
          ${planLabel(plan)} plan · ${formatAmount(amountDue, currency)}
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:14px;color:hsl(220,25%,10%);font-weight:600;margin:0 0 8px;">Hi ${businessName},</p>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 20px;">
          Your bank requires additional verification (3D Secure) to authorise the
          <strong>${formatAmount(amountDue, currency)}</strong> renewal charge for your
          <strong>${planLabel(plan)}</strong> plan. This is a one-time step — your subscription
          will stay active once authentication is complete.
        </p>

        <div style="background:hsl(220,20%,97%);border-radius:12px;padding:18px 20px;margin:0 0 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:10px;vertical-align:top;">
                <p style="font-size:12px;color:hsl(220,10%,50%);margin:0 0 2px;">Amount</p>
                <p style="font-size:13px;color:hsl(220,25%,10%);font-weight:700;margin:0;">${formatAmount(amountDue, currency)}</p>
              </td>
              <td style="padding-bottom:10px;vertical-align:top;text-align:right;">
                <p style="font-size:12px;color:hsl(220,10%,50%);margin:0 0 2px;">Plan</p>
                <p style="font-size:13px;color:hsl(220,25%,10%);font-weight:600;margin:0;">${planLabel(plan)}</p>
              </td>
            </tr>
          </table>
          <p style="font-size:12px;color:hsl(220,10%,55%);margin:8px 0 0;line-height:1.5;">
            Your link expires in 24 hours. After that, contact support if you still cannot pay.
          </p>
        </div>

        <div style="text-align:center;margin:0 0 16px;">
          <a href="${appUrl}/settings/billing"
            style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;display:inline-block;">
            Complete authentication
          </a>
        </div>

        <p style="font-size:11px;color:hsl(220,10%,60%);text-align:center;margin:0;line-height:1.5;">
          If you did not initiate this charge or need help, contact our support team.
        </p>
      </div>`;

  return baseTemplate('Payment authentication required', body);
}
