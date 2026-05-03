import { baseTemplate } from './base.template';

export const contractClientTemplate = (
  firstName: string,
  businessName: string,
  jobTitle: string,
  pdfUrl: string,
  signingUrl: string,
): string => {
  const body = `
    <h2 style="margin:0 0 12px;">Your Service Contract Is Ready</h2>
    <p>Hi ${firstName},</p>
    <p>
      ${businessName} has prepared your contract for <strong>${jobTitle}</strong>.
      You can review and sign it directly from the client app using the secure link below.
    </p>
    <p style="margin:20px 0;">
      <a href="${signingUrl}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">
        Review & Sign Contract
      </a>
    </p>
    <p>
      Prefer a direct file link?
      <a href="${pdfUrl}">Download the contract PDF</a>.
    </p>
    <p style="margin-top:24px;">Thank you,<br/>${businessName}</p>
  `;

  return baseTemplate('Contract Ready for Signature', body);
};
