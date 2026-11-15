import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAuthBuild } from '../scripts/validate-auth-build';

test('legacy builds keep their default and matching Clerk builds are accepted', () => {
  assert.equal(validateAuthBuild({}), 'supabase');
  assert.equal(validateAuthBuild({ VITE_AUTH_PROVIDER: 'supabase', AUTH_PROVIDER: 'supabase' }), 'supabase');
  assert.equal(validateAuthBuild({ VITE_AUTH_PROVIDER: 'clerk', AUTH_PROVIDER: 'clerk', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' }), 'clerk');
});

test('the reported registration mismatch and its reverse cannot ship', () => {
  for (const env of [
    { AUTH_PROVIDER: 'clerk' },
    { AUTH_PROVIDER: 'clerk', VITE_AUTH_PROVIDER: 'supabase' },
    { AUTH_PROVIDER: 'supabase', VITE_AUTH_PROVIDER: 'clerk' },
    { VITE_AUTH_PROVIDER: 'clerk' },
  ]) assert.throws(() => validateAuthBuild(env), /mixed deployment breaks registration/);
});

test('typos, quotes and hidden whitespace cannot silently select legacy auth', () => {
  for (const name of ['VITE_AUTH_PROVIDER', 'AUTH_PROVIDER']) {
    for (const value of ['', 'Clerk', 'clerk ', 'clerk\n', '"clerk"', 'clerkk']) {
      assert.throws(() => validateAuthBuild({ [name]: value }), /must be exactly clerk or supabase/);
    }
  }
});

test('missing or private keys cannot be bundled as the Clerk publishable key', () => {
  for (const key of [undefined, '', 'sk_live_private_fixture', 'pk_live_fixture\n']) {
    assert.throws(() => validateAuthBuild({ VITE_AUTH_PROVIDER: 'clerk', AUTH_PROVIDER: 'clerk', VITE_CLERK_PUBLISHABLE_KEY: key }), /requires VITE_CLERK_PUBLISHABLE_KEY/);
  }
});

test('diagnostics never repeat an accidentally pasted secret', () => {
  const secret = 'sk_live_private_fixture';
  assert.throws(() => validateAuthBuild({ VITE_AUTH_PROVIDER: secret }), (error: Error) => !error.message.includes(secret));
});
