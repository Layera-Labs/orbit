// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ResendEmailSender, emailSenderFromEnv } from '../email.js';

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
