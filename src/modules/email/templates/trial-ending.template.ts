import { baseTemplate } from './base.template';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

function planLabel(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function trialEndingTemplate(
  businessName: string,
  plan: SubscriptionPlan,
  daysLeft: number,
  appUrl: string,
): string {
  const urgencyColor = daysLeft === 1 ? 'hsl(0,80%,55%)' : 'hsl(38,95%,50%)';
  const urgencyBg = daysLeft === 1 ? 'hsl(0,100%,97%)' : 'hsl(38,100%,97%)';

  const body = `
      <div style="background:linear-gradient(135deg,hsl(38,95%,50%) 0%,hsl(25,100%,55%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">⏰</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}
        </h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;line-height:1.5;">
          Add a payment method now to keep uninterrupted access.
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:14px;color:hsl(220,25%,10%);font-weight:600;margin:0 0 8px;">Hi ${businessName},</p>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 20px;">
          Your 7-day free trial on the <strong>${planLabel(plan)} plan</strong> is coming to an end.
          Add a payment method before your trial expires to avoid any interruption to your service.
        </p>

        <div style="background:${urgencyBg};border-left:3px solid ${urgencyColor};border-radius:8px;padding:14px 16px;margin:0 0 24px;">
          <p style="font-size:13px;color:${urgencyColor};font-weight:600;margin:0 0 4px;">
            ${daysLeft === 1 ? '🚨 Last chance!' : '⚠️ Action required'}
          </p>
          <p style="font-size:12px;color:hsl(220,10%,40%);margin:0;line-height:1.5;">
            Your trial ends in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.
            Without a payment method, your account will enter a 5-day grace period and then be locked.
          </p>
        </div>

        <div style="text-align:center;">
          <a href="${appUrl}/settings/billing"
            style="background:linear-gradient(135deg,hsl(38,95%,50%) 0%,hsl(25,100%,55%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;display:inline-block;">
            Add payment method now
          </a>
        </div>

        <p style="font-size:11px;color:hsl(220,10%,60%);text-align:center;margin:20px 0 0;line-height:1.5;">
          You can manage your billing at any time from your dashboard settings.
        </p>
      </div>`;

  return baseTemplate('Your free trial is ending soon', body);
}
