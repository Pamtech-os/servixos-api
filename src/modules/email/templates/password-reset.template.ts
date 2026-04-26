import { baseTemplate } from './base.template';

export function passwordResetTemplate(firstName: string, otp: string): string {
  const body = `
      <!-- Hero banner -->
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:36px 32px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">🔒</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">Password Reset Request</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">
          Use the code below to reset your Servix OS password.
        </p>
      </div>

      <!-- White card body -->
      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 24px;">
          Hi <strong style="color:hsl(220,25%,10%);">${firstName}</strong>, we received a request to reset the password for your Servix OS account. Enter the verification code below to proceed.
        </p>

        <!-- OTP box -->
        <div style="background:#f5f8ff;border:1.5px solid hsl(217,91%,88%);border-radius:14px;padding:28px 20px;text-align:center;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:10px;font-weight:600;color:hsl(220,10%,55%);letter-spacing:1.5px;text-transform:uppercase;">
            Verification Code
          </p>
          <div style="color:hsl(217,91%,55%);font-size:40px;font-weight:700;letter-spacing:14px;font-family:'Courier New',monospace;line-height:1;padding-left:14px;">
            ${otp}
          </div>
          <p style="margin:12px 0 0;font-size:11px;color:hsl(220,10%,55%);">
            Expires in <strong style="color:hsl(220,25%,10%);">10 minutes</strong>
          </p>
        </div>

        <!-- Security note -->
        <div style="background:#f5f8ff;border-left:3px solid hsl(217,91%,60%);border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 24px;">
          <p style="margin:0;font-size:11px;color:hsl(220,10%,46%);line-height:1.6;">
            🛡️ Never share this code with anyone. Servix OS will never ask for it via email or phone.
          </p>
        </div>

        <hr style="border:none;border-top:1px solid hsl(220,13%,92%);margin:0 0 20px;" />

        <p style="margin:0 0 4px;font-size:12px;color:hsl(220,10%,46%);line-height:1.6;">
          Didn't request a password reset?
        </p>
        <p style="margin:0;font-size:12px;color:hsl(220,10%,60%);line-height:1.6;">
          You can safely ignore this email — your account remains secure and unchanged.
        </p>
      </div>`;

  return baseTemplate('Reset Your Password — Servix OS', body);
}
