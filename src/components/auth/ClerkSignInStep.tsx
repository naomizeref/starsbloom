import { useEffect, useRef, useState } from 'react';
import type { useSignIn } from '@clerk/react/legacy';
import { ShieldCheck } from 'lucide-react';
import { authErrorMessage } from '../../lib/authFormAdapter';

export type SignInAttempt = NonNullable<ReturnType<typeof useSignIn>['signIn']>;
const methodNames: Record<string, string> = { totp: 'Authenticator app', backup_code: 'Backup code',
  email_code: 'Email code', phone_code: 'Text message', passkey: 'Passkey' };
const inputClass = 'w-full rounded-xl border border-orbit-border/85 bg-orbit-bg px-4 py-3 text-base text-orbit-white outline-none focus:border-orbit-accent';

// Continue the SAME Clerk attempt after its password has been checked. Mounting
// a full SignIn widget here can restart the flow and ask for credentials again.
export function ClerkSignInStep({ attempt, onContinue, onBack }: {
  attempt: SignInAttempt;
  onContinue: (result: SignInAttempt) => Promise<void>;
  onBack: () => void;
}) {
  const secondFactor = attempt.status === 'needs_second_factor' || attempt.status === 'needs_client_trust';
  const newPasswordRequired = attempt.status === 'needs_new_password';
  const factors = (secondFactor ? attempt.supportedSecondFactors : attempt.status === 'needs_first_factor'
    ? attempt.supportedFirstFactors : []) || [];
  const available = factors.filter(factor => factor.strategy in methodNames);
  const [selected, setSelected] = useState(0);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [prepared, setPrepared] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const factor = available[selected];
  const delivery = factor?.strategy === 'email_code' || factor?.strategy === 'phone_code';
  const passkey = factor?.strategy === 'passkey';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch (failure) { if (mounted.current) setError(authErrorMessage(failure, 'Unable to verify. Please try again.')); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const sendCode = async () => {
    if (cooldown > 0 || !factor) return;
    if (factor.strategy === 'email_code') {
      const params = { strategy: 'email_code' as const, emailAddressId: factor.emailAddressId };
      if (secondFactor) await attempt.prepareSecondFactor(params);
      else await attempt.prepareFirstFactor(params);
    } else if (factor.strategy === 'phone_code') {
      const params = { strategy: 'phone_code' as const, phoneNumberId: factor.phoneNumberId };
      if (secondFactor) await attempt.prepareSecondFactor(params);
      else await attempt.prepareFirstFactor(params);
    } else return;
    if (mounted.current) { setPrepared(true); setCooldown(60); }
  };
  const verify = async () => {
    let result: SignInAttempt;
    if (newPasswordRequired) {
      if (password.length < 8) throw new Error('Use at least 8 characters for your new password.');
      if (password !== confirmation) throw new Error('The passwords do not match.');
      result = await attempt.resetPassword({ password, signOutOfOtherSessions: true });
    } else if (factor?.strategy === 'passkey') {
      result = await attempt.authenticateWithPasskey(secondFactor ? undefined : { flow: 'discoverable' });
    } else if (factor) {
      if (delivery && !prepared) { await sendCode(); return; }
      if (!code.trim()) throw new Error('Enter your verification code.');
      if (factor.strategy === 'email_code' || factor.strategy === 'phone_code') {
        const params = { strategy: factor.strategy, code: code.trim() };
        result = secondFactor ? await attempt.attemptSecondFactor(params) : await attempt.attemptFirstFactor(params);
      } else if (secondFactor && (factor.strategy === 'totp' || factor.strategy === 'backup_code')) {
        result = await attempt.attemptSecondFactor({ strategy: factor.strategy, code: code.trim() });
      } else throw new Error('Choose another verification method.');
    } else return;
    if (mounted.current) await onContinue(result);
  };

  return <form onSubmit={event => { event.preventDefault(); void run(verify); }} className="flex flex-col gap-5">
    <div>
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orbit-accent/10 text-orbit-accent"><ShieldCheck size={24} /></span>
      <h2 className="font-brand text-[25px] font-bold tracking-tight text-orbit-white">{newPasswordRequired ? 'Update your password' : 'Verify your sign-in'}</h2>
      <p className="mt-2 text-sm text-orbit-gray-text">{newPasswordRequired
        ? 'Choose a new password to finish signing in.'
        : attempt.status === 'needs_client_trust' ? 'Confirm this device to finish signing in.' : 'Complete your account’s security check.'}</p>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm text-red-400">{error}</p>}
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5 disabled:opacity-60">
      {newPasswordRequired ? <>
        <label className="space-y-2 text-sm text-orbit-gray-text">New password<input type="password" autoComplete="new-password" className={inputClass} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className="space-y-2 text-sm text-orbit-gray-text">Confirm new password<input type="password" autoComplete="new-password" className={inputClass} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      </> : factor ? <>
        {available.length > 1 && <label className="space-y-2 text-sm text-orbit-gray-text">Verification method
          <select className={inputClass} value={selected} onChange={event => { setSelected(Number(event.target.value)); setPrepared(false); setCode(''); setError(null); }}>
            {available.map((item, index) => <option key={index} value={index}>{methodNames[item.strategy]}{'safeIdentifier' in item ? ` (${item.safeIdentifier})` : ''}</option>)}
          </select>
        </label>}
        {delivery && <p className="text-sm text-orbit-gray-text">{prepared ? 'Code sent to' : 'Send a code to'} {'safeIdentifier' in factor ? factor.safeIdentifier : 'your account'}.</p>}
        {!passkey && (!delivery || prepared) && <label className="space-y-2 text-sm text-orbit-gray-text">{factor.strategy === 'backup_code' ? 'Backup code' : 'Verification code'}
          <input autoComplete="one-time-code" inputMode={factor.strategy === 'backup_code' ? 'text' : 'numeric'} className={inputClass}
            value={code} onChange={event => setCode(event.target.value)} />
        </label>}
      </> : <p role="alert" className="text-sm text-orbit-gray-text">This account requires a verification method that is not available here. Return to sign in or contact support for help.</p>}
      {(newPasswordRequired || factor) && <button type="submit" disabled={delivery && !prepared && cooldown > 0} className="orb-button w-full py-4 disabled:opacity-50">
        {busy ? 'Please wait…' : newPasswordRequired ? 'Update password & sign in' : passkey ? 'Continue with passkey' : delivery && !prepared ? (cooldown > 0 ? `Send code in ${cooldown}s` : 'Send verification code') : 'Verify & sign in'}
      </button>}
      {delivery && prepared && <button type="button" disabled={cooldown > 0} onClick={() => void run(sendCode)} className="text-sm font-semibold text-orbit-accent disabled:opacity-50">
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </button>}
      <button type="button" onClick={onBack} className="text-sm text-orbit-gray-text hover:text-white">← Return to sign in</button>
    </fieldset>
  </form>;
}
