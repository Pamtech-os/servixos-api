import { baseTemplate } from './base.template';

export function newServiceRequestTemplate(
  ownerFirstName: string,
  clientName: string,
  service: string,
  requestedDate: string,
  businessName: string,
  message?: string,
): string {
  const messageRow = message
    ? `<tr>
        <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;vertical-align:top;">Message</td>
        <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:500;padding:4px 0;">${message}</td>
      </tr>`
    : '';

  const body = `
      <div style="background:linear-gradient(135deg,hsl(158,64%,40%) 0%,hsl(187,78%,41%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">🛎️</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          New service request
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          A client just submitted a request on ${businessName}.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${ownerFirstName}</strong>, you have a new service request waiting for your review.
        </p>

        <div style="background:#f0fdf8;border:1.5px solid hsl(158,64%,80%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Request details
          </p>
          <table style="border-collapse:collapse;width:100%;">
            <tbody>
              <tr>
                <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;">Client</td>
                <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;padding:4px 0;">${clientName}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;">Service</td>
                <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;padding:4px 0;">${service}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;">Requested date</td>
                <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;padding:4px 0;">${requestedDate}</td>
              </tr>
              ${messageRow}
            </tbody>
          </table>
        </div>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Log in to Servix OS to review and respond to this request.
        </p>
      </div>`;

  return baseTemplate('New service request — Servix OS', body);
}
