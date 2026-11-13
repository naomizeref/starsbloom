import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildEmail } from '../api/_emailTemplates';
import { deliverEmail } from '../api/_emailDelivery';
import sendHandler from '../api/send-email';
import authHandler from '../api/auth-codes';
import { EMAIL_EVENTS } from '../src/lib/emailEvents';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const email = 'user@example.com';
let sends: { body: any; key: string | null }[];
let codeRow: any;
let passwordWrites: number;
let userRole: string;
let fetches: number;
const hash = (code: string) => createHash('sha256').update(`${code}:${email}`).digest('hex');
const response = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const user = { id: '11111111-1111-4111-8111-111111111111', email, email_confirmed_at: '2026-01-01T00:00:00Z' };

async function mockFetch(input: string | URL | Request, init?: RequestInit) {
  fetches++;
  const url = new URL(input instanceof Request ? input.url : input);
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const headers = new Headers(init?.headers);
  if (url.hostname === 'api.resend.com') {
    sends.push({ body, key: headers.get('Idempotency-Key') });
    return response({ id: 'mail-1' });
  }
  assert.equal(url.hostname, 'fixture.supabase.co', 'No real service calls');
  if (url.pathname === '/auth/v1/user') return response(user);
  if (url.pathname === '/auth/v1/admin/users' && method === 'GET') return response({ users: [user] });
  if (url.pathname === '/auth/v1/admin/users/11111111-1111-4111-8111-111111111111') { passwordWrites++; return response({ user }); }
  if (url.pathname === '/rest/v1/users') return response({ id: '11111111-1111-4111-8111-111111111111', role: userRole, status: 'active' });
  if (url.pathname === '/rest/v1/support_tickets') return response({ id: 'ticket-1', subject: 'Help', messages: [{ sender: 'user', text: 'Saved reply' }] });
  if (url.pathname === '/rest/v1/auth_email_codes') {
    if (method === 'DELETE') return response(null);
    if (method === 'GET') return response(codeRow ? [structuredClone(codeRow)] : []);
    if (method === 'POST') {
      if (codeRow) return response({ code: '23505' }, 409);
      codeRow = { id: 'code-1', ...body };
      return response(codeRow, 201);
    }
    if (method === 'PATCH') {
      const matches = codeRow && [...url.searchParams].every(([key, condition]) => {
        if (['select'].includes(key)) return true;
        return condition.startsWith('gt.') ? String(codeRow[key]) > condition.slice(3) : String(codeRow[key]) === condition.slice(3);
      });
      if (!matches) return response(null);
      Object.assign(codeRow, body);
      return response({ ...codeRow });
    }
  }
  throw new Error(`Unhandled test route ${method} ${url.pathname}`);
}

beforeEach(() => {
  Object.assign(process.env, { SUPABASE_URL: 'https://fixture.supabase.co', VITE_SUPABASE_URL: 'https://fixture.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only', RESEND_API_KEY: 'test-only', RESEND_FROM_EMAIL: 'Bloom <notify@example.com>',
    BLOOM_COMPANY_NAME: 'Bloom', BLOOM_SUPPORT_EMAIL: 'support@example.com', BLOOM_SITE_URL: 'https://bloom.example.com' });
  sends = []; codeRow = null; passwordWrites = 0; fetches = 0; userRole = 'user';
  globalThis.fetch = mockFetch as typeof fetch;
});
afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });

async function call(handler: typeof sendHandler | typeof authHandler, body: any, token = 'valid-session') {
  let status = 0; let result: any;
  const headers: Record<string, string> = {};
  await handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body } as any, {
    setHeader(name: string, value: string) { headers[name] = value; },
    status(value: number) { status = value; return this; },
    json(value: any) { result = value; return this; },
  } as any);
  return { status, result, headers };
}
const notification = (to = email, eventType = 'WELCOME', metadata = {}) => ({ to, eventType, metadata: { eventId: 'event-1', ...metadata } });
const storedCode = () => ({ id: 'code-1', email, purpose: 'password_reset', code_hash: hash('123456'), attempts: 0, consumed: false,
  created_at: new Date(Date.now() - 60000).toISOString(), expires_at: new Date(Date.now() + 900000).toISOString() });

test('every event renders escaped HTML and plain text; codes stay out of the subject', () => {
  for (const type of EMAIL_EVENTS) {
    const result = buildEmail(type, { name: '<script>alert(1)</script>', code: '123456', amount: 0, replyPreview: '<img onerror=x>' });
    assert.ok(result.text.length > 30);
    assert.ok(!result.html.includes('<script>'));
    assert.ok(!result.html.includes('<img onerror'));
    assert.ok(!result.subject.includes('123456'));
    assert.ok(!result.html.includes('undefined'));
    assert.ok(!result.html.includes('<svg'));
  }
  assert.throws(() => buildEmail('INVALID'));
});

test('templates match saved payout, top-up, reward and market-order metadata', () => {
  const payout = buildEmail('INVESTMENT_COMPLETED', { investmentName: 'Starter', payoutAmount: 125, profit: 0 });
  assert.match(payout.text, /Starter/); assert.match(payout.text, /Total Credited: \$125.00/); assert.match(payout.text, /Profit Earned: \$0.00/);
  assert.doesNotMatch(payout.text, /Principal:/);
  assert.match(buildEmail('COPY_TRADE_COMPLETED', { total: 110, pnl: 10 }).text, /Total credited: \$110.00/);
  assert.match(buildEmail('TOPUP_SUCCESS', { investmentName: 'Starter', amount: 20 }).text, /Investment: Starter/);
  assert.doesNotMatch(buildEmail('TRADE_EXECUTED', { side: 'Sell' }).text, /bot|Copy Trading/);
  assert.match(buildEmail('SUPPORT_TICKET_REPLY', { reference: 'ticket-1', replyPreview: 'Please review your receipt.' }).text, /Please review your receipt/);
});

test('sender configuration fails before contacting any provider; no test-sender fallback', async () => {
  delete process.env.RESEND_API_KEY;
  await assert.rejects(deliverEmail(email, 'WELCOME', {}, 'event-1'), /not configured/);
  assert.equal(fetches, 0);
  process.env.RESEND_API_KEY = 'test-only'; process.env.RESEND_FROM_EMAIL = 'Bloom <onboarding@resend.dev>';
  await assert.rejects(deliverEmail(email, 'WELCOME', {}, 'event-1'), /not configured/);
  assert.equal(fetches, 0);
});

test('temporary failures retry identical payload and key, permanent rejections do not retry', async () => {
  let calls = 0; const requests: any[] = [];
  globalThis.fetch = (async (_input, init) => { calls++; requests.push(init); if (calls === 1) throw new Error('timeout'); return response({ id: 'accepted-id' }); }) as typeof fetch;
  assert.deepEqual(await deliverEmail(email, 'WELCOME', {}, 'stable-event'), { id: 'accepted-id', status: 'accepted' });
  assert.equal(requests[0].body, requests[1].body); assert.deepEqual(requests[0].headers, requests[1].headers);
  calls = 0;
  globalThis.fetch = (async () => { calls++; return response({ message: 'domain not verified; private provider detail' }, 403); }) as typeof fetch;
  await assert.rejects(deliverEmail(email, 'WELCOME', {}, 'stable-event'), /could not be sent/);
  assert.equal(calls, 1);
});

test('notification endpoint authenticates and prevents arbitrary recipients and forged auth codes', async () => {
  assert.equal((await call(sendHandler, notification(), '')).status, 401);
  assert.equal(fetches, 0);
  assert.equal((await call(sendHandler, notification('someone@example.com'))).status, 403);
  assert.equal((await call(sendHandler, notification(email, 'PASSWORD_RESET'))).status, 400);
  assert.equal((await call(sendHandler, notification(email, 'INVALID'))).status, 400);
  assert.equal(sends.length, 0);
  const result = await call(sendHandler, notification(email, 'WELCOME', { siteUrl: 'https://evil.example', supportEmail: 'attacker@example.com', replyToEmail: 'attacker@example.com', companyName: 'Fake' }));
  assert.equal(result.status, 200); assert.equal(result.result.status, 'accepted');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.doesNotMatch(sends[0].body.html, /evil.example|attacker@example.com|Fake/);
  assert.equal(sends[0].body.reply_to, 'support@example.com');
});

test('admin can notify another registered account; support mail uses saved message', async () => {
  userRole = 'admin';
  assert.equal((await call(sendHandler, notification('customer@example.com', 'DEPOSIT_APPROVED'))).status, 200);
  userRole = 'user';
  assert.equal((await call(sendHandler, notification('support@example.com', 'SUPPORT_TICKET_REPLY', { reference: 'ticket-1', replyPreview: 'Forged text' }))).status, 200);
  assert.match(sends[1].body.text, /Saved reply/); assert.doesNotMatch(sends[1].body.text, /Forged text/);
});

test('resends update the cooldown and simultaneous issues send only one code', async () => {
  codeRow = storedCode();
  const issue = { action: 'issue', purpose: 'password_reset', email };
  const results = await Promise.all([call(authHandler, issue), call(authHandler, issue)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
  assert.equal(sends.length, 1);
  assert.ok(Date.now() - Date.parse(codeRow.created_at) < 3000);
  assert.equal((await call(authHandler, issue)).status, 429);
  assert.equal(codeRow.consumed, false);
});

test('invalid reset passwords leave codes usable; concurrent successful verification consumes once', async () => {
  codeRow = storedCode();
  const verify = { action: 'verify', purpose: 'password_reset', email, code: '123456', newPassword: 'password-123' };
  assert.equal((await call(authHandler, { ...verify, newPassword: 'short' })).status, 400);
  assert.equal(codeRow.consumed, false);
  const results = await Promise.all([call(authHandler, verify), call(authHandler, verify)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal(passwordWrites, 1); assert.equal(codeRow.consumed, true);
});

test('concurrent wrong attempts cannot bypass the attempt limit', async () => {
  codeRow = storedCode();
  await Promise.all(Array.from({ length: 8 }, () => call(authHandler, { action: 'verify', purpose: 'password_reset', email, code: '999999', newPassword: 'password-123' })));
  assert.equal(codeRow.attempts, 5); assert.equal(passwordWrites, 0);
  assert.equal((await call(authHandler, { action: 'verify', purpose: 'password_reset', email, code: '123456', newPassword: 'password-123' })).status, 429);
});

test('missing mail configuration does not replace codes or create accounts', async () => {
  codeRow = storedCode();
  const before = structuredClone(codeRow);
  delete process.env.RESEND_API_KEY;
  const result = await call(authHandler, { action: 'issue', email, purpose: 'signup_verification', password: 'password-123' });
  assert.equal(result.status, 503);
  assert.deepEqual(codeRow, before); assert.equal(fetches, 0);
});

test('expired codes are rejected without updating account credentials', async () => {
  codeRow = { ...storedCode(), expires_at: new Date(Date.now() - 1000).toISOString() };
  assert.equal((await call(authHandler, { action: 'verify', purpose: 'password_reset', email, code: '123456', newPassword: 'password-123' })).status, 400);
  assert.equal(passwordWrites, 0);
});

test('password reset finds accounts beyond the first auth directory page', async () => {
  codeRow = storedCode();
  const pages: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === '/auth/v1/admin/users') {
      pages.push(url.searchParams.get('page')!);
      return response({ users: url.searchParams.get('page') === '1' ? Array.from({ length: 1000 }, (_, i) => ({ id: String(i), email: `other${i}@example.com` })) : [user] });
    }
    return mockFetch(input, init);
  }) as typeof fetch;
  assert.equal((await call(authHandler, { action: 'verify', purpose: 'password_reset', email, code: '123456', newPassword: 'password-123' })).status, 200);
  assert.deepEqual(pages, ['1', '2']); assert.equal(passwordWrites, 1);
});

for (const failure of [
  { status: 403, message: 'The private-sender.example domain is not verified. Private provider detail.', code: 'EMAIL_SENDER_NOT_VERIFIED' },
  { status: 401, message: 'API key is invalid. Private provider detail.', code: 'EMAIL_API_KEY_INVALID' },
]) test(`deposit notification reports ${failure.code} safely without retries`, async () => {
  let attempts = 0;
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith('https://api.resend.com/')) {
      attempts++;
      return response({ name: 'validation_error', message: failure.message }, failure.status);
    }
    return mockFetch(input, init);
  }) as typeof fetch;
  const { status, result } = await call(sendHandler, notification(email, 'DEPOSIT_SUBMITTED', { amount: 100 }));
  assert.equal(status, 503);
  assert.equal(result.success, false);
  assert.equal(result.code, failure.code);
  assert.doesNotMatch(JSON.stringify(result), /private-sender|Private provider detail/);
  assert.equal(attempts, 1);
  assert.equal(passwordWrites, 0);
});
