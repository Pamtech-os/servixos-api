import { baseTemplate } from './base.template';
import { escapeHtml } from 'src/common/utils/html.util';
import { WaitlistPersona } from 'src/modules/waitlist/schemas/waitlist-entry.schema';

const PERSONA_MESSAGES: Record<WaitlistPersona, string> = {
  [WaitlistPersona.ASPIRING_FOUNDER]:
    "You told us you want to start a business but aren't sure what to start yet. That's exactly where Servix OS can help — our AI tools will help you explore ideas that fit your skills and turn the right one into a real business.",
  [WaitlistPersona.HAS_IDEA]:
    "You told us you already have a business idea. We'll help you go from idea to launch — setting up your workspace, website, services and pricing so you can start serving customers faster.",
  [WaitlistPersona.BUSINESS_OWNER]:
    'You told us you already run a business. Servix OS brings your clients, jobs, scheduling, invoices and team into one place, with AI that helps you spot opportunities and save time every day.',
  [WaitlistPersona.EXPLORING]:
    "You told us you're curious about Servix OS. We'll share a behind-the-scenes look at what we're building so you can see how it fits the way you work.",
};

export function waitlistJoinedTemplate(
  firstName: string,
  persona: WaitlistPersona,
  unsubscribeUrl: string,
): string {
  const name = escapeHtml(firstName) || 'there';
  const personaMessage = PERSONA_MESSAGES[persona] ?? '';

  const body = `
      <!-- Hero / gradient banner -->
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:36px;margin:0 0 10px;line-height:1;">🚀</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">You're on the list!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">
          Thanks for joining the Servix OS early access waitlist.
        </p>
      </div>

      <!-- White card body -->
      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <h2 style="font-size:16px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 8px;letter-spacing:-0.01em;">
          Hi ${name}, welcome!
        </h2>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          We're building Servix OS — the all-in-one platform to start, run and grow
          a service business. You're now among the first in line, and we'll keep you
          updated on our progress and let you know as soon as early access opens.
        </p>
        ${
          personaMessage
            ? `<p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 24px;">${personaMessage}</p>`
            : ''
        }

        <!-- What happens next -->
        <div style="background:#f5f8ff;border-radius:10px;padding:16px 16px 14px;margin:0 0 24px;">
          <p style="font-size:12px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 10px;">What happens next</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:8px;vertical-align:top;">
                <p style="font-size:12px;font-weight:600;color:hsl(217,91%,50%);margin:0 0 2px;">📬 Product updates</p>
                <p style="font-size:11px;color:hsl(220,10%,40%);margin:0;line-height:1.5;">We'll share occasional updates on new features as we build them.</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:8px;vertical-align:top;">
                <p style="font-size:12px;font-weight:600;color:hsl(217,91%,50%);margin:0 0 2px;">🔑 Early access invite</p>
                <p style="font-size:11px;color:hsl(220,10%,40%);margin:0;line-height:1.5;">You'll be among the first to get an invite when early access becomes available.</p>
              </td>
            </tr>
            <tr>
              <td style="vertical-align:top;">
                <p style="font-size:12px;font-weight:600;color:hsl(217,91%,50%);margin:0 0 2px;">💬 Shape the product</p>
                <p style="font-size:11px;color:hsl(220,10%,40%);margin:0;line-height:1.5;">Have ideas or questions? Just reply to this email — we read every message.</p>
              </td>
            </tr>
          </table>
        </div>

        <p style="font-size:12px;color:hsl(220,10%,50%);line-height:1.6;margin:0;">
          You're receiving this email because you joined the Servix OS waitlist.
          If this wasn't you, or you'd rather not hear from us,
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:hsl(217,91%,50%);">unsubscribe here</a>.
        </p>
      </div>`;

  return baseTemplate("You're on the Servix OS waitlist", body);
}
