import type { EmailMessage } from '../services/emailService.js';

export async function sendWithPostmark(message: EmailMessage): Promise<void> {
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN || '',
    },
    body: JSON.stringify({
      From: process.env.EMAIL_FROM || 'noreply@web3studentlab.example',
      To: message.to,
      Subject: message.subject,
      HtmlBody: message.html,
      Attachments: message.attachments?.map((attachment) => ({
        Name: attachment.filename,
        Content: attachment.content,
        ContentType: attachment.contentType || 'application/pdf',
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Postmark delivery failed with status ${response.status}`);
  }
}