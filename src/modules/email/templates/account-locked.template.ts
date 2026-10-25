import { baseTemplate } from './base.template';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

function planLabel(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function accountLockedTemplate(
  businessName: string,
  plan: SubscriptionPlan,
  appUrl: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(0,70%,40%) 0%,hsl(0,60%,30%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">🔒</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Your account has been locked
        </h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">
          ${planLabel(plan)} plan · Outstanding payment required
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:14px;color:hsl(220,25%,10%);font-weight:600;margin:0 0 8px;">Hi ${businessName},</p>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 20px;">
          Your 5-day grace period has ended and your <strong>${planLabel(plan)}</strong> subscription is now
          locked due to an outstanding payment. You can still log in, but all business features
          are paused until you settle the balance.
        </p>

        <div style="background:hsl(220,20%,97%);border-radius:12px;padding:18px 20px;margin:0 0 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:10px;vertical-align:top;">
                <p style="font-size:12px;color:hsl(220,10%,50%);margin:0 0 2px;">Status</p>
                <p style="font-size:13px;color:hsl(0,70%,45%);font-weight:700;margin:0;">Account locked</p>
              </td>
              <td style="padding-bottom:10px;vertical-align:top;text-align:right;">
                <p style="font-size:12px;color:hsl(220,10%,50%);margin:0 0 2px;">Plan</p>
                <p style="font-size:13px;color:hsl(220,25%,10%);font-weight:600;margin:0;">${planLabel(plan)}</p>
              </td>
            </tr>
          </table>
          <p style="font-size:12px;color:hsl(220,10%,55%);margin:8px 0 0;line-height:1.5;">
            Your data is 100% safe and preserved. Pay to restore full access instantly.
          </p>
        </div>

        <div style="text-align:center;margin:0 0 16px;">
          <a href="${appUrl}/settings/billing"
            style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;display:inline-block;">
            Pay now to restore access
          </a>
        </div>

        <p style="font-size:11px;color:hsl(220,10%,60%);text-align:center;margin:0;line-height:1.5;">
          Need help? Contact our support team — your data is safe and waiting for you.
        </p>
      </div>`;

  return baseTemplate('Your account has been locked', body);
}
