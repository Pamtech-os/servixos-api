export function adminOtpTemplate(firstName: string, otp: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0f0f0f;color:#e5e5e5;border-radius:8px">
      <h2 style="color:#fff;margin-bottom:4px">Login Verification</h2>
      <p style="color:#888;font-size:13px;margin-top:0">ServixOS Admin Portal</p>
      <p style="margin-top:24px">Hi <strong>${firstName}</strong>,</p>
      <p>Your one-time password for this login session is:</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:20px;text-align:center;margin:24px 0">
        <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#4f8ef7">${otp}</span>
      </div>
      <p style="color:#888;font-size:13px">This code expires in <strong style="color:#e5e5e5">10 minutes</strong>. Do not share it with anyone.</p>
      <p style="color:#888;font-size:13px;margin-top:24px">If you did not attempt to log in, please contact your system administrator immediately.</p>
    </div>
  `;
}
