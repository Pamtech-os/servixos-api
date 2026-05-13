import { baseTemplate } from './base.template';

export function teamAnnouncementTemplate(
  recipientName: string,
  title: string,
  description: string,
  authorName: string,
  businessName: string,
  createdAtLabel: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">📣</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          New team announcement
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          ${businessName} posted an announcement for all staff.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${recipientName}</strong>, a new announcement has been posted.
        </p>

        <div style="background:#f5f8ff;border:1.5px solid hsl(217,91%,88%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Announcement
          </p>
          <p style="margin:0 0 10px;font-size:18px;font-weight:700;color:hsl(220,25%,10%);line-height:1.4;">
            ${title}
          </p>
          <p style="margin:0 0 14px;font-size:13px;color:hsl(220,10%,34%);line-height:1.75;">
            ${description}
          </p>
          <table style="border-collapse:collapse;width:100%;">
            <tbody>
              <tr>
                <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;">Posted by</td>
                <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;padding:4px 0;">${authorName}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;">Date</td>
                <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;padding:4px 0;">${createdAtLabel}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Open Servix OS for discussion and follow-up actions.
        </p>
      </div>`;

  return baseTemplate('New team announcement — Servix OS', body);
}
