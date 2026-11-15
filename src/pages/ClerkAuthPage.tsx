import { useRef, useState } from "react";
import { SignUp, AuthenticateWithRedirectCallback } from "@clerk/react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import { AuthPage } from "./AuthPage";
import type { AuthFormAdapter } from "../lib/authFormAdapter";
import { ClerkSignInStep, type SignInAttempt } from '../components/auth/ClerkSignInStep';

export function ClerkAuthPage({ initialTab = "register", onNavigate }: {
  initialTab?: "login" | "register";
  onNavigate: (view: string) => void;
}) {
  const signup = useSignUp();
  const signin = useSignIn();
  const [continuation, setContinuation] = useState<'login' | 'register' | null>(null);
  const pendingSignup = useRef<typeof signup.signUp>(undefined);
  const pendingSignin = useRef<typeof signin.signIn>(undefined);
  const [loginStep, setLoginStep] = useState<{ attempt: SignInAttempt; revision: number } | null>(null);

  const requireReady = () => {
    if (!signup.isLoaded || !signin.isLoaded) throw new Error('Sign-in is loading. Please try again in a moment.');
  };
  const finishSignin = async (result: NonNullable<typeof signin.signIn>) => {
    pendingSignin.current = result;
    if (result.status === 'complete' && result.createdSessionId) {
      await signin.setActive!({ session: result.createdSessionId });
      // BloomAuthProvider provisions the mapped identity before App redirects.
    } else {
      setLoginStep(previous => ({ attempt: result, revision: (previous?.revision || 0) + 1 }));
      setContinuation('login');
    }
  };

  const auth: AuthFormAdapter = {
    ready: signup.isLoaded && signin.isLoaded,
    continuation: continuation === 'login' && loginStep
      ? <ClerkSignInStep key={loginStep.revision} attempt={loginStep.attempt} onContinue={finishSignin}
          onBack={() => { setContinuation(null); setLoginStep(null); }} />
      : continuation === 'register' ? <div className="min-w-0 [&_.cl-rootBox]:w-full [&_.cl-cardBox]:w-full [&_.cl-cardBox]:max-w-full">
          <h2 className="mb-4 text-xl font-bold text-orbit-white">Complete registration</h2>
          <SignUp routing="hash" signInUrl="/login" />
        </div> : null,
    async register(details) {
      requireReady();
      const { email, password, ...bloomProfile } = details;
      const params = { emailAddress: email, password, unsafeMetadata: { bloomProfile }, legalAccepted: true };
      const previous = pendingSignup.current;
      let attempt = previous?.emailAddress === email && previous.status !== 'complete'
        ? await previous.update(params)
        : await signup.signUp!.create(params);
      pendingSignup.current = attempt;
      // Name/username fields can be disabled in Clerk. Only send native fields
      // the instance supports; the complete Bloom profile lives in metadata.
      const supported = [...attempt.requiredFields, ...attempt.optionalFields];
      const fields = {
        ...(supported.includes('first_name') ? { firstName: details.firstName } : {}),
        ...(supported.includes('last_name') ? { lastName: details.lastName } : {}),
        ...(supported.includes('username') ? { username: details.username } : {}),
      };
      if (Object.keys(fields).length) {
        attempt = await attempt.update(fields);
        pendingSignup.current = attempt;
      }
      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await signup.setActive!({ session: attempt.createdSessionId });
        return 'complete';
      }
      if (attempt.unverifiedFields.includes('email_address')) {
        await attempt.prepareEmailAddressVerification({ strategy: 'email_code' });
        return 'verify';
      }
      setContinuation('register');
      return 'continue';
    },
    async verify(code) {
      requireReady();
      const attempt = pendingSignup.current || signup.signUp!;
      const result = await attempt.attemptEmailAddressVerification({ code });
      pendingSignup.current = result;
      if (result.status === 'complete' && result.createdSessionId) {
        await signup.setActive!({ session: result.createdSessionId });
      } else setContinuation('register');
    },
    async resend() {
      requireReady();
      await (pendingSignup.current || signup.signUp!).prepareEmailAddressVerification({ strategy: 'email_code' });
    },
    async login(email, password) {
      requireReady();
      await finishSignin(await signin.signIn!.create({ strategy: 'password', identifier: email, password }));
    },
    async requestReset(email) {
      requireReady();
      pendingSignin.current = await signin.signIn!.create({ strategy: 'reset_password_email_code', identifier: email });
    },
    async resetPassword(code, password) {
      requireReady();
      await finishSignin(await (pendingSignin.current || signin.signIn!).attemptFirstFactor({ strategy: 'reset_password_email_code', code, password }));
    },
  };

  return <AuthPage key={initialTab} initialTab={initialTab} onNavigate={onNavigate} auth={auth} />;
}
export function ClerkCallback() { return <AuthenticateWithRedirectCallback />; }
