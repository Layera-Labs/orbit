/**
 * Transactional email — a small pluggable seam, mirroring the auth/ledger
 * adapter pattern. Today the one provider is Resend (a plain HTTPS API, so no
 * new dependency); an SMTP sender can slot in behind the same interface later.
 *
 * Selected by env, like the other providers:
 *   EMAIL_PROVIDER=resend        (the only value supported today)
 *   RESEND_API_KEY=<key>         (the user supplies this, like RUNWAY_API_TOKEN)
 *   EMAIL_FROM="Orbit <no-reply@yourdomain>"
 *
 * When no provider is configured, `emailSenderFromEnv` returns null and the
 * caller responds with a clean "email not configured" error — never a crash.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  readonly provider: string;
  send(msg: EmailMessage): Promise<void>;
}

/** Resend (https://resend.com) transactional email over its HTTPS API. */
export class ResendEmailSender implements EmailSender {
  readonly provider = 'resend';
  constructor(
    private apiKey: string,
    private from: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend send failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
  }
}

/** Select an email sender from env, or null when none is configured. */
export function emailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender | null {
  const provider = (env.EMAIL_PROVIDER ?? (env.RESEND_API_KEY ? 'resend' : '')).toLowerCase();
  if (provider === 'resend') {
    if (!env.RESEND_API_KEY) return null;
    const from = env.EMAIL_FROM ?? 'Orbit <onboarding@resend.dev>';
    return new ResendEmailSender(env.RESEND_API_KEY, from);
  }
  return null;
}
