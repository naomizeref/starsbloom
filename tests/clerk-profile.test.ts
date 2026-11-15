import assert from 'node:assert/strict';
import test from 'node:test';
import { clerkSignupProfile } from '../api/_clerkSignupProfile';
import { provisionClerkAccount } from '../api/_clerkAuth';

const preferences = { username: 'bloomtest', firstName: 'Bloom', lastName: 'Test', phone: '+2348000000000',
  gender: 'Other', country: 'Nigeria', currency: 'USD', accountType: 'Silver' };
test('signup metadata copies only personal details and supported preferences', () => {
  const result = clerkSignupProfile({ ...preferences, id: 'victim', role: 'admin', status: 'active', balance: 1000000,
    email: 'someone-else@example.invalid', kyc_status: 'verified', portfolio_value: 50000 });
  assert.deepEqual(result, { username: 'bloomtest', first_name: 'Bloom', last_name: 'Test', phone: '+2348000000000',
    name: 'Bloom Test', gender: 'Other', country: 'Nigeria', currency: 'USD', account_type: 'Silver' });
  for (const change of [{ currency: 'INVALID' }, { accountType: 'Admin' }, { firstName: null }, { country: 'Invalid' }]) {
    assert.equal(clerkSignupProfile({ ...preferences, ...change }), null);
  }
});

test('profile initialization is retry-safe and does not overwrite existing or imported profiles', async () => {
  const stored: Record<string, any> = { id: 'mapped', email: 'verified@example.invalid', name: 'Bloom member', role: 'user',
    balance: 500, status: 'active', username: null, first_name: null, last_name: null };
  const filters: [string, unknown][] = [];
  let changes: any, writes = 0;
  const query = { eq(key: string, value: unknown) { filters.push([key, value]); return this; },
    is(key: string, value: unknown) { filters.push([key, value]); return this; }, select() { return this; },
    async maybeSingle() {
      if (!filters.every(([key, value]) => stored[key] === value)) return { data: null, error: null };
      Object.assign(stored, changes); writes++; return { data: { id: stored.id, email: stored.email, name: stored.name }, error: null };
    } };
  const client: any = { rpc: async () => ({ data: { id: stored.id, email: stored.email, name: stored.name }, error: null }),
    from(table: string) { assert.equal(table, 'users'); return { update(value: unknown) { changes = value; filters.length = 0; return query; } }; } };
  const account = { subject: 'user_fixture', issuer: 'https://clerk.example.invalid', email: stored.email,
    name: 'Bloom Test', legacyId: null, signupProfile: clerkSignupProfile(preferences) };
  assert.equal((await provisionClerkAccount(client, account)).name, 'Bloom Test');
  assert.ok(filters.some(([key, value]) => key === 'id' && value === 'mapped'));
  await provisionClerkAccount(client, { ...account, signupProfile: clerkSignupProfile({ ...preferences, firstName: 'Overwrite' }) });
  assert.equal(writes, 1);
  assert.equal(stored.first_name, 'Bloom');
  assert.equal(stored.balance, 500);
  assert.equal(stored.role, 'user');
  await provisionClerkAccount(client, { ...account, legacyId: 'mapped' });
  assert.equal(writes, 1);
  stored.username = null; stored.first_name = null; stored.last_name = null; stored.role = 'admin';
  await provisionClerkAccount(client, account);
  assert.equal(writes, 1);
});
