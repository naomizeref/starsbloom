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


test('new Vercel production projects cannot silently fall back to legacy auth', () => {
  for (const env of [{}, { AUTH_PROVIDER: 'supabase' }, { VITE_AUTH_PROVIDER: 'supabase' }]) {
    assert.throws(() => validateAuthBuild({ ...env, VERCEL_ENV: 'production' }), /missing in Production/);
  }
  assert.equal(validateAuthBuild({ VERCEL_ENV: 'production', VITE_AUTH_PROVIDER: 'supabase', AUTH_PROVIDER: 'supabase' }), 'supabase');
  assert.equal(validateAuthBuild({ VERCEL_ENV: 'preview' }), 'supabase');
});

test('production Clerk builds require the server configuration used after signup', () => {
  const env: Record<string, string> = {
    VERCEL_ENV: 'production', VITE_AUTH_PROVIDER: 'clerk', AUTH_PROVIDER: 'clerk',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture',
    CLERK_JWT_ISSUER: 'https://clerk.example.com', CLERK_AUTHORIZED_PARTIES: 'https://example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'server-fixture',
  };
  assert.equal(validateAuthBuild(env), 'clerk');
  for (const name of ['CLERK_SECRET_KEY', 'CLERK_JWT_ISSUER', 'CLERK_AUTHORIZED_PARTIES', 'SUPABASE_SERVICE_ROLE_KEY']) {
    for (const value of [undefined, '', '   ']) {
      assert.throws(() => validateAuthBuild({ ...env, [name]: value }), error =>
        error instanceof Error && error.message.includes(name) && error.message.includes('missing in Production') &&
        !error.message.includes('sk_test_fixture') && !error.message.includes('server-fixture'));
    }
  }
});
