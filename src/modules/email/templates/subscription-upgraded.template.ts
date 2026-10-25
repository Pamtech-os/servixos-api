import { baseTemplate } from './base.template';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

const NEW_FEATURES: Record<
  SubscriptionPlan,
  { icon: string; label: string }[]
> = {
  [SubscriptionPlan.STARTER]: [],
  [SubscriptionPlan.GROWTH]: [
    { icon: '💡', label: 'AI Suggestions (up to 50)' },
    { icon: '💰', label: 'AI Pricing Assistant' },
    { icon: '📄', label: 'AI Contract Generator' },
    { icon: '🧾', label: 'Invoicing (up to 50)' },
    { icon: '🧑‍💼', label: 'Client Management (up to 50)' },
    { icon: '👥', label: 'Team Members (up to 10)' },
  ],
  [SubscriptionPlan.PRO]: [
    { icon: '💡', label: 'AI Suggestions (unlimited)' },
    { icon: '🧾', label: 'Invoicing (unlimited)' },
    { icon: '🧑‍💼', label: 'Client Management (unlimited)' },
    { icon: '👥', label: 'Team Members (unlimited)' },
    { icon: '🎯', label: 'Custom roles & advanced workflows' },
    { icon: '🌐', label: 'Custom domain for your website' },
  ],
};

function planLabel(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function subscriptionUpgradedTemplate(
  businessName: string,
  fromPlan: SubscriptionPlan,
  toPlan: SubscriptionPlan,
  appUrl: string,
): string {
  const newFeatures = NEW_FEATURES[toPlan] ?? [];
  const featureRows = newFeatures
    .map(
      (f) => `
        <tr>
          <td style="padding:6px 0;vertical-align:middle;">
            <span style="font-size:15px;margin-right:10px;">${f.icon}</span>
            <span style="font-size:13px;color:hsl(220,10%,30%);">${f.label}</span>
          </td>
        </tr>`,
    )
    .join('');

  const body = `
      <div style="background:linear-gradient(135deg,hsl(270,70%,55%) 0%,hsl(217,91%,60%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:40px;margin:0 0 10px;line-height:1;">⚡</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          You've upgraded to ${planLabel(toPlan)}!
        </h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;line-height:1.5;">
          Upgraded from ${planLabel(fromPlan)} → ${planLabel(toPlan)}
        </p>
      </div>

      <div style="background:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <h2 style="font-size:16px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 6px;">
          Congratulations, ${businessName}!
        </h2>
        <p style="font-size:13px;color:hsl(220,10%,45%);line-height:1.6;margin:0 0 20px;">
          Your plan has been upgraded. Here are the powerful new features you've just unlocked.
        </p>

        ${
          featureRows.length > 0
            ? `
        <div style="background:linear-gradient(135deg,hsl(270,70%,97%) 0%,hsl(217,91%,97%) 100%);border-radius:12px;padding:18px 20px;margin:0 0 24px;">
          <p style="font-size:12px;font-weight:700;color:hsl(270,70%,50%);margin:0 0 12px;letter-spacing:0.03em;text-transform:uppercase;">
            New in ${planLabel(toPlan)}
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${featureRows}
          </table>
        </div>`
            : ''
        }

        <div style="text-align:center;">
          <a href="${appUrl}/dashboard"
            style="background:linear-gradient(135deg,hsl(270,70%,55%) 0%,hsl(217,91%,60%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;display:inline-block;">
            Explore your new features
          </a>
        </div>
      </div>`;

  return baseTemplate(`You've upgraded to ${planLabel(toPlan)}`, body);
}
