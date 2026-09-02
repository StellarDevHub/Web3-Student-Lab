import logger from '../utils/logger.js';
import { enqueueEmail, type EmailJobData } from './emailQueue.js';
import { notificationPreferencesService } from '../notifications/preferences.service.js';

export interface CertificateEmailOptions {
  studentEmail: string;
  studentName: string;
  courseTitle: string;
  certificateId: string;
  tokenId: string;
  verificationUrl: string;
  linkedInShareUrl?: string;
  twitterShareUrl?: string;
  pdfBase64?: string;
}

export async function sendCertificateMintedEmail(options: CertificateEmailOptions) {
  const prefs = await notificationPreferencesService.getByStudentId(options.studentEmail);
  if (prefs && !prefs.emailEnabled) {
    logger.info(`Skipping certificate email for ${options.studentEmail}: email disabled in preferences`);
    return;
  }

  const html = generateCertificateEmailHtml(options);
  const jobData: EmailJobData = {
    to: options.studentEmail,
    subject: `🎉 Congratulations! You earned a certificate in ${options.courseTitle}`,
    html,
    attachments: options.pdfBase64
      ? [
          {
            filename: `certificate-${options.certificateId}.pdf`,
            content: options.pdfBase64,
            contentType: 'application/pdf',
          },
        ]
      : undefined,
    metadata: {
      type: 'certificate.minted',
      certificateId: options.certificateId,
      tokenId: options.tokenId,
    },
  };

  await enqueueEmail(jobData);
}

function generateCertificateEmailHtml(options: CertificateEmailOptions): string {
  const linkedInButton = options.linkedInShareUrl
    ? `<a href="${options.linkedInShareUrl}" style="display:inline-block;padding:12px 24px;background:#0A66C2;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Add to LinkedIn</a>`
    : '';
  const twitterButton = options.twitterShareUrl
    ? `<a href="${options.twitterShareUrl}" style="display:inline-block;padding:12px 24px;background:#1DA1F2;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin-left:8px;">Share on Twitter</a>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate Issued</title>
</head>
<body style="font-family:Arial,sans-serif;background:#f6f9fc;margin:0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:40px 32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Web3 Student Lab</h1>
              <p style="color:#cbd5e1;margin:8px 0 0;font-size:14px;">Blockchain-Verified Certificate</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#0f172a;margin:0 0 12px;font-size:20px;">Congratulations, ${escapeHtml(options.studentName)}!</h2>
              <p style="color:#334155;line-height:1.6;margin:0 0 16px;">
                You have successfully completed <strong>${escapeHtml(options.courseTitle)}</strong>.
                Your certificate has been minted on the Stellar network and is ready to share.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:16px 0;">
                <tr>
                  <td style="padding:16px;color:#475569;font-size:13px;">
                    <p style="margin:0 0 4px;"><strong>Certificate ID:</strong> ${escapeHtml(options.certificateId)}</p>
                    <p style="margin:0 0 4px;"><strong>Token ID:</strong> ${escapeHtml(options.tokenId)}</p>
                    <p style="margin:0;"><strong>Verify:</strong> <a href="${options.verificationUrl}" style="color:#2563eb;">${options.verificationUrl}</a></p>
                  </td>
                </tr>
              </table>
              <p style="text-align:center;margin:24px 0 8px;">
                <a href="${options.verificationUrl}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">View Certificate</a>
                ${linkedInButton}
                ${twitterButton}
              </p>
              <p style="color:#64748b;font-size:12px;text-align:center;margin-top:16px;">
                Questions? Contact support@web3studentlab.example
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
