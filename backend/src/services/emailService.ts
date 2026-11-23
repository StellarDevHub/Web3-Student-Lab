import { sendWithPostmark } from '../integrations/postmarkProvider.js';
import { sendWithSes } from '../integrations/sesProvider.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
}

export async function sendEmail(message: EmailMessage): Promise<{ provider: string }> {
  const providers: Array<{ name: string; send: () => Promise<void> }> = [];
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

  if (region) {
    providers.push({ name: 'ses', send: () => sendWithSes(message, region) });
  }
  if (process.env.POSTMARK_SERVER_TOKEN) {
    providers.push({ name: 'postmark', send: () => sendWithPostmark(message) });
  }

  if (providers.length === 0) {
    throw new Error('No email provider configured');
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      await provider.send();
      return { provider: provider.name };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error('Email delivery failed for all configured providers', { cause: lastError });
}