import { baseTemplate } from './base.template';

export function clientCredentialsTemplate(
  firstName: string,
  businessName: string,
  temporaryPassword: string,
  loginUrl: string,
): string {
  const body = `
      <!-- Hero banner -->
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">🔐</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Your Client Account Is Ready
        </h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">
          We've created your Servix OS client login so you can track requests and updates.
        </p>
      </div>

      <!-- White card body -->
      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${firstName}</strong>, a service request was submitted for
          <strong style="color:hsl(220,25%,10%);">${businessName}</strong> using this email address.
        </p>

        <div style="background:#f5f8ff;border:1.5px solid hsl(217,91%,88%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Temporary Password
          </p>
          <p style="margin:0;font-size:22px;font-weight:700;color:hsl(217,91%,50%);font-family:'Courier New',monospace;letter-spacing:1px;word-break:break-all;">
            ${temporaryPassword}
          </p>
        </div>

        <div style="background:#fff7e6;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 22px;">
          <p style="margin:0;font-size:12px;color:hsl(220,10%,40%);line-height:1.6;">
            Important: for security, you must change this password immediately after your first login.
          </p>
        </div>

        <div style="text-align:center;margin:0 0 18px;">
          <a
            href="${loginUrl}"
            style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;display:inline-block;"
          >
            Login To Your Account
          </a>
        </div>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Email: <strong style="color:hsl(220,25%,10%);">this email address</strong><br />
          If you did not submit a service request, please contact support immediately.
        </p>
      </div>`;

  return baseTemplate('Your Servix OS client credentials', body);
}
