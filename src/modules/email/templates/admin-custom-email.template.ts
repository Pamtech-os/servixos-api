import { baseTemplate } from './base.template';

export function adminCustomEmailTemplate(
  recipientName: string,
  subject: string,
  message: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          ${subject}
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          Message from Servix OS Admin
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${recipientName}</strong>,
        </p>
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0;white-space:pre-line;">
          ${message}
        </p>
      </div>`;

  return baseTemplate(subject, body);
}

export function adminInvitationTemplate(
  firstName: string,
  temporaryPassword: string,
  loginUrl: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          You've been invited to Servix OS
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          Your account has been created by an administrator.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${firstName}</strong>, your account has been set up on Servix OS.
          Use the temporary password below to log in and complete your account setup.
        </p>

        <div style="background:#f5f8ff;border:1.5px solid hsl(217,91%,88%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Temporary Password
          </p>
          <p style="margin:0;font-size:22px;font-weight:700;color:hsl(217,91%,50%);font-family:'Courier New',monospace;letter-spacing:1px;word-break:break-all;">
            ${temporaryPassword}
          </p>
        </div>

        <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,hsl(217,91%,60%),hsl(270,70%,60%));color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:600;">
          Log In Now
        </a>

        <p style="font-size:11px;color:hsl(220,10%,60%);margin:18px 0 0;line-height:1.5;">
          You will be prompted to change your password on first login.
        </p>
      </div>`;

  return baseTemplate('Welcome to Servix OS', body);
}
