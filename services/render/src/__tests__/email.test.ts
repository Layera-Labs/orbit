// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ResendEmailSender, emailSenderFromEnv, resetEmailMessage } from '../email.js';

describe('emailSenderFromEnv', () => {
  it('returns null when nothing is configured', () => {
    expect(emailSenderFromEnv({})).toBeNull();
  });

  it('returns a Resend sender when RESEND_API_KEY is set (provider inferred)', () => {
    const s = emailSenderFromEnv({ RESEND_API_KEY: 'k' } as NodeJS.ProcessEnv);
    expect(s?.provider).toBe('resend');
  });

  it('returns null when EMAIL_PROVIDER=resend but the key is missing', () => {
    expect(emailSenderFromEnv({ EMAIL_PROVIDER: 'resend' } as NodeJS.ProcessEnv)).toBeNull();
  });

  it('returns null for an unknown provider', () => {
    expect(emailSenderFromEnv({ EMAIL_PROVIDER: 'smtp', RESEND_API_KEY: 'k' } as NodeJS.ProcessEnv)).toBeNull();
  });

  /*
   * The empty string, which is what compose passes for `${EMAIL_PROVIDER:-}`
   * when it is unset. `??` does not fire on `""`, so the old code resolved the
   * provider to `""`, missed the resend branch and returned null on a box whose
   * .env plainly contained the key — email silently off, and a 503 pointing
   * nowhere near the cause. Same shape that once zeroed a byte budget.
   */
  it('treats empty strings as unset, not as values', () => {
    expect(
      emailSenderFromEnv({ EMAIL_PROVIDER: '', RESEND_API_KEY: 'k' } as NodeJS.ProcessEnv)?.provider,
    ).toBe('resend');
    expect(emailSenderFromEnv({ RESEND_API_KEY: '   ' } as NodeJS.ProcessEnv)).toBeNull();
  });

  it('falls back to the default From on an empty EMAIL_FROM', async () => {
    const seen: RequestInit[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      seen.push(init);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const sender = emailSenderFromEnv({ RESEND_API_KEY: 'k', EMAIL_FROM: '' } as NodeJS.ProcessEnv)!;
    // Reach past the factory to assert what it built, without a live send.
    await new ResendEmailSender('k', (sender as unknown as { from: string }).from, f).send({
      to: 'a@b.com',
      subject: 's',
      text: 't',
    });
    expect(JSON.parse(String(seen[0].body)).from).toContain('@');
  });
});

describe('resetEmailMessage', () => {
  it('prefers the link and puts it in both parts', () => {
    const msg = resetEmailMessage('a@b.com', 'https://x.example/reset?token=abc', 'abc');
    expect(msg.text).toContain('https://x.example/reset?token=abc');
    expect(msg.html).toContain('https://x.example/reset?token=abc');
    // The raw token is never offered as something to paste when a link exists —
    // it would be a second, worse instruction in the same email.
    expect(msg.text).not.toContain('Enter this code');
  });

  it('falls back to the token when there is no link', () => {
    const msg = resetEmailMessage('a@b.com', undefined, 'aaa.bbb.ccc');
    expect(msg.text).toContain('aaa.bbb.ccc');
    expect(msg.text).not.toContain('http');
    expect(msg.html).toContain('aaa.bbb.ccc');
  });

  it('escapes the link into the HTML part', () => {
    // A link base is operator-supplied config, not user input — but it is the
    // one value that reaches this markup, so it goes in escaped.
    const msg = resetEmailMessage('a@b.com', 'https://x.example/r?a=1&b=2"><script>', 't');
    expect(msg.html).toContain('&amp;');
    expect(msg.html).not.toContain('<script>');
  });
});

describe('ResendEmailSender', () => {
  it('POSTs the message and throws on a non-2xx response', async () => {
    const ok = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
    await new ResendEmailSender('key', 'Orbit <no-reply@x>', ok as unknown as typeof fetch).send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
    });
    expect(ok).toHaveBeenCalledOnce();
    const [url, init] = ok.mock.calls[0];
    expect(url).toContain('api.resend.com');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key');

    const bad = (async () => new Response('nope', { status: 422 })) as unknown as typeof fetch;
    await expect(
      new ResendEmailSender('key', 'from', bad).send({ to: 'a@b.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/422/);
  });
});
