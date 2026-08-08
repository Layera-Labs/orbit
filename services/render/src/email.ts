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

/** `&<>"` → entities. The only value that reaches the HTML body is the link. */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The password-reset message, in both parts.
 *
 * Text is not a courtesy here, it is the fallback every mail client can render
 * and the one some people read. Both parts must say the same thing, so they are
 * built together rather than in two places that drift.
 *
 * `link` is preferred over `code` for a reason worth stating: the code IS the
 * token, a ~300-character JWT, and a mail client will hard-wrap it. What comes
 * back off the clipboard then carries newlines and no longer verifies. The code
 * path exists for a deployment that has configured no address to link to.
 */
export function resetEmailMessage(
  to: string,
  link: string | undefined,
  code: string,
): EmailMessage {
  const text =
    `You asked to reset your Orbit password.\n\n` +
    (link
      ? `Open this link to choose a new one:\n${link}\n\n`
      : `Enter this code in the app to continue:\n\n${code}\n\n`) +
    `It expires in 1 hour and can be used once. ` +
    `If you didn't ask for this, you can ignore this email. Nothing has changed.`;

  /*
   * Restrained on purpose. Every mail client renders CSS differently and most
   * strip anything clever, so this is one column, system fonts, and a single
   * solid button — no gradient, no glow, no image that has to load from
   * somewhere. The code variant sets the token in a wrapping monospace block,
   * which is the one place a mono is genuinely right: it is data, and the
   * distinction between l/1 and O/0 is load-bearing.
   */
  const body = link
    ? `<p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;padding:13px 22px;border-radius:11px;background:#5b4bff;color:#ffffff;font-weight:600;text-decoration:none">Choose a new password</a></p>
       <p style="margin:0 0 22px;color:#6c6c78;font-size:13px;line-height:1.5">If the button does not work, paste this into your browser:<br>
       <span style="color:#5b4bff;word-break:break-all">${esc(link)}</span></p>`
    : `<p style="margin:0 0 12px">Enter this code in the app to continue:</p>
       <p style="margin:0 0 22px;padding:14px;border-radius:11px;background:#f2f2f5;color:#17171a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.45;word-break:break-all">${esc(code)}</p>`;

  const html = `<div style="margin:0;padding:32px 20px;background:#ffffff;color:#17171a;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5">
  <div style="max-width:420px;margin:0 auto">
    <h1 style="margin:0 0 10px;font-size:22px;font-weight:650;letter-spacing:-0.015em">Reset your Orbit password</h1>
    <p style="margin:0 0 24px;color:#6c6c78">You asked to reset it. This is the only thing you need to do.</p>
    ${body}
    <p style="margin:0;padding-top:20px;border-top:1px solid #e6e6eb;color:#6c6c78;font-size:13px;line-height:1.5">
      It expires in 1 hour and can be used once. If you didn't ask for this, you can ignore this email. Nothing has changed.
    </p>
  </div>
</div>`;

  return { to, subject: 'Reset your Orbit password', text, html };
}

/** Select an email sender from env, or null when none is configured. */
export function emailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender | null {
  /*
   * Every read here is truthiness, never `??`, and that is load-bearing rather
   * than stylistic. Compose forwards an unset variable as the EMPTY STRING
   * (`${EMAIL_PROVIDER:-}`), and `??` does not fire on `""` — so the old
   * `env.EMAIL_PROVIDER ?? …` resolved to `""`, missed the `'resend'` branch,
   * and returned null on a box whose .env plainly contained the key. Email
   * silently off, with a 503 pointing nowhere near the cause. The same shape
   * once made a byte budget zero and evicted every upload on arrival.
   */
  const key = env.RESEND_API_KEY?.trim();
  const provider = (env.EMAIL_PROVIDER?.trim() || (key ? 'resend' : '')).toLowerCase();
  if (provider === 'resend') {
    if (!key) return null;
    const from = env.EMAIL_FROM?.trim() || 'Orbit <onboarding@resend.dev>';
    return new ResendEmailSender(key, from);
  }
  return null;
}
