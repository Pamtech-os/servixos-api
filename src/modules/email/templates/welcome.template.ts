import { baseTemplate } from './base.template';

export function welcomeTemplate(firstName: string, appUrl: string): string {
  const body = `
      <!-- Hero / gradient banner -->
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:36px;margin:0 0 10px;line-height:1;">🎉</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">You're all set up</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">
          Your business workspace on Servix OS is ready to go.
        </p>
      </div>

      <!-- White card body -->
      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <h2 style="font-size:16px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 8px;letter-spacing:-0.01em;">
          Welcome aboard, ${firstName}!
        </h2>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 24px;">
          Your business has been onboarded successfully. Here's everything
          that's now available to you from your dashboard.
        </p>

        <!-- Feature grid -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td width="50%" style="padding:0 6px 10px 0;vertical-align:top;">
              <div style="background:#f5f8ff;border-radius:10px;padding:14px 14px 12px;">
                <p style="font-size:18px;margin:0 0 6px;line-height:1;">👥</p>
                <p style="font-size:12px;font-weight:600;color:hsl(220,25%,10%);margin:0 0 3px;">Team Members</p>
                <p style="font-size:11px;color:hsl(220,10%,46%);margin:0;line-height:1.5;">Invite and manage your team with role-based access.</p>
              </div>
            </td>
            <td width="50%" style="padding:0 0 10px 6px;vertical-align:top;">
              <div style="background:#f5f8ff;border-radius:10px;padding:14px 14px 12px;">
                <p style="font-size:18px;margin:0 0 6px;line-height:1;">💳</p>
                <p style="font-size:12px;font-weight:600;color:hsl(220,25%,10%);margin:0 0 3px;">Subscription</p>
                <p style="font-size:11px;color:hsl(220,10%,46%);margin:0;line-height:1.5;">View and manage your plan, billing, and usage.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td width="50%" style="padding:0 6px 10px 0;vertical-align:top;">
              <div style="background:#f5f8ff;border-radius:10px;padding:14px 14px 12px;">
                <p style="font-size:18px;margin:0 0 6px;line-height:1;">📊</p>
                <p style="font-size:12px;font-weight:600;color:hsl(220,25%,10%);margin:0 0 3px;">Analytics</p>
                <p style="font-size:11px;color:hsl(220,10%,46%);margin:0;line-height:1.5;">Track performance with real-time reports and trends.</p>
              </div>
            </td>
            <td width="50%" style="padding:0 0 10px 6px;vertical-align:top;">
              <div style="background:#f5f8ff;border-radius:10px;padding:14px 14px 12px;">
                <p style="font-size:18px;margin:0 0 6px;line-height:1;">🧑‍💼</p>
                <p style="font-size:12px;font-weight:600;color:hsl(220,25%,10%);margin:0 0 3px;">Clients</p>
                <p style="font-size:11px;color:hsl(220,10%,46%);margin:0;line-height:1.5;">Manage client profiles, interactions, and history.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">
              <div style="background:#f5f8ff;border-radius:10px;padding:14px 14px 12px;">
                <p style="font-size:18px;margin:0 0 6px;line-height:1;">🌐</p>
                <p style="font-size:12px;font-weight:600;color:hsl(220,25%,10%);margin:0 0 3px;">Website</p>
                <p style="font-size:11px;color:hsl(220,10%,46%);margin:0;line-height:1.5;">Build and manage your business site in one place.</p>
              </div>
            </td>
            <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">
              <div style="background:#f5f8ff;border-radius:10px;padding:14px 14px 12px;">
                <p style="font-size:18px;margin:0 0 6px;line-height:1;">🧾</p>
                <p style="font-size:12px;font-weight:600;color:hsl(220,25%,10%);margin:0 0 3px;">Invoices</p>
                <p style="font-size:11px;color:hsl(220,10%,46%);margin:0;line-height:1.5;">Create, send, and track invoices with ease.</p>
              </div>
            </td>
          </tr>
        </table>

        <!-- AI section -->
        <div style="background:linear-gradient(135deg,hsl(217,91%,97%) 0%,hsl(270,70%,97%) 100%);border-radius:10px;padding:16px 16px 14px;margin:0 0 24px;">
          <p style="font-size:12px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 10px;">✨ AI-powered actions</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:8px;vertical-align:top;">
                <p style="font-size:12px;font-weight:600;color:hsl(217,91%,50%);margin:0 0 2px;">Suggestions</p>
                <p style="font-size:11px;color:hsl(220,10%,40%);margin:0;line-height:1.5;">Smart recommendations tailored to your business activity.</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:8px;vertical-align:top;">
                <p style="font-size:12px;font-weight:600;color:hsl(217,91%,50%);margin:0 0 2px;">Advisor</p>
                <p style="font-size:11px;color:hsl(220,10%,40%);margin:0;line-height:1.5;">Get strategic advice on growth, operations, and decisions.</p>
              </td>
            </tr>
            <tr>
              <td style="vertical-align:top;">
                <p style="font-size:12px;font-weight:600;color:hsl(217,91%,50%);margin:0 0 2px;">Insights</p>
                <p style="font-size:11px;color:hsl(220,10%,40%);margin:0;line-height:1.5;">Understand patterns and trends across your business data.</p>
              </td>
            </tr>
          </table>
        </div>

        <!-- CTA -->
        <div style="text-align:center;">
          <a
            href="${appUrl}/dashboard"
            style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;display:inline-block;"
          >
            Go to your dashboard
          </a>
        </div>
      </div>`;

  return baseTemplate('Your Servix OS workspace is ready', body);
}
