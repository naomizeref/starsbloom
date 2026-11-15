type AuthBuildEnvironment = Record<string, string | undefined>;

function provider(env: AuthBuildEnvironment, name: string) {
  const value = env[name];
  if (value === undefined) return 'supabase';
  if (value === 'clerk' || value === 'supabase') return value;
  // Do not echo arbitrary environment values: a key may have been pasted here.
  throw new Error(`[Bloom auth build] ${name} must be exactly clerk or supabase, without quotes, spaces or newlines.`);
}

export function validateAuthBuild(env: AuthBuildEnvironment) {
  const frontend = provider(env, 'VITE_AUTH_PROVIDER');
  const server = provider(env, 'AUTH_PROVIDER');
  if (frontend !== server) {
    throw new Error(`[Bloom auth build] Frontend=${frontend}, server=${server}. Set VITE_AUTH_PROVIDER and AUTH_PROVIDER to the same value in this deployment environment, then rebuild. A mixed deployment breaks registration.`);
  }
  const key = env.VITE_CLERK_PUBLISHABLE_KEY || '';
  if (frontend === 'clerk' && (key !== key.trim() || !/^pk_(live|test)_[A-Za-z0-9_-]+$/.test(key))) {
    throw new Error('[Bloom auth build] Clerk requires VITE_CLERK_PUBLISHABLE_KEY in the build environment. Use the public pk_live_ or pk_test_ key, without spaces or newlines.');
  }
  return frontend;
}
