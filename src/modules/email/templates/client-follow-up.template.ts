import { baseTemplate } from './base.template';

export function clientFollowUpTemplate(
  businessName: string,
  clientName: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,50%) 0%,hsl(250,84%,58%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">👋</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Just checking in
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          ${businessName} wanted to reconnect with you.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${clientName}</strong>,
          it's been a little while since your last project with us. We'd love to help
          with anything new you have coming up — just reply to this email and we'll
          get you scheduled.
        </p>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Thanks for being a valued client of ${businessName}.
        </p>
      </div>`;

  return baseTemplate(`Just checking in — ${businessName}`, body);
}
