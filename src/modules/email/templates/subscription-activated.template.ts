import { baseTemplate } from './base.template';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

const PLAN_FEATURES: Record<
  SubscriptionPlan,
  { icon: string; label: string }[]
> = {
  [SubscriptionPlan.STARTER]: [
    { icon: '🤖', label: 'AI Business Setup' },
    { icon: '🔧', label: 'Jobs Management (up to 10)' },
    { icon: '🧾', label: 'Invoicing (up to 10)' },
    { icon: '🧑‍💼', label: 'Client Management (up to 10)' },
    { icon: '✨', label: 'AI Insights' },
    { icon: '💡', label: 'AI Suggestions (up to 5)' },
    { icon: '👥', label: 'Team Members (1)' },
    { icon: '🎧', label: 'Support Center' },
  ],
  [SubscriptionPlan.GROWTH]: [
    { icon: '🤖', label: 'Everything in Starter +' },
    { icon: '💡', label: 'AI Suggestions (up to 50)' },
    { icon: '💰', label: 'AI Pricing Assistant' },
    { icon: '📄', label: 'AI Contract Generator' },
    { icon: '🧾', label: 'Invoicing (up to 50)' },
    { icon: '🧑‍💼', label: 'Client Management (up to 50)' },
    { icon: '👥', label: 'Team Members (up to 10)' },
  ],
  [SubscriptionPlan.PRO]: [
    { icon: '🚀', label: 'Everything in Growth +' },
    { icon: '💡', label: 'AI Suggestions (unlimited)' },
    { icon: '🧾', label: 'Invoicing (unlimited)' },
    { icon: '🧑‍💼', label: 'Client Management (unlimited)' },
    { icon: '👥', label: 'Team Members (unlimited)' },
  ],
};

function planLabel(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function subscriptionActivatedTemplate(
  businessName: string,
  plan: SubscriptionPlan,
  appUrl: string,
): string {
  const features = PLAN_FEATURES[plan] ?? [];
  const featureRows = features
    .map(
      (f) => `
        <tr>
          <td style="padding:6px 0;vertical-align:middle;">
            <span style="font-size:16px;margin-right:10px;">${f.icon}</span>
            <span style="font-size:13px;color:hsl(220,10%,30%);">${f.label}</span>
          </td>
        </tr>`,
    )
    .join('');

  const body = `
      <div style="background:linear-gradient(135deg,hsl(142,70%,45%) 0%,hsl(217,91%,60%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">🎉</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          You're now on the ${planLabel(plan)} plan!
        </h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;line-height:1.5;">
          Your subscription is active. Here's everything you can do.
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <h2 style="font-size:16px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 6px;">
          Welcome to ${planLabel(plan)}, ${businessName}!
        </h2>
        <p style="font-size:13px;color:hsl(220,10%,45%);line-height:1.6;margin:0 0 20px;">
          Your account is fully active. Below are all the features included in your plan.
        </p>

        <div style="background:#f5f8ff;border-radius:12px;padding:18px 20px;margin:0 0 24px;">
          <p style="font-size:12px;font-weight:700;color:hsl(217,91%,50%);margin:0 0 12px;letter-spacing:0.03em;text-transform:uppercase;">
            ${planLabel(plan)} Features
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${featureRows}
          </table>
        </div>

        <div style="text-align:center;">
          <a href="${appUrl}/dashboard"
            style="background:linear-gradient(135deg,hsl(142,70%,45%) 0%,hsl(217,91%,60%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;display:inline-block;">
            Go to your dashboard
          </a>
        </div>
      </div>`;

  return baseTemplate(`Your ${planLabel(plan)} plan is active`, body);
}
