import type { ReactNode } from 'react';

export interface SignupDetails {
  email: string;
  password: string;
  username: string;
  firstName: string;
  lastName: string;
  gender: string;
  phone: string;
  accountType: string;
  country: string;
  currency: string;
}

export interface AuthFormAdapter {
  ready: boolean;
  continuation?: ReactNode;
  register(details: SignupDetails): Promise<'verify' | 'complete' | 'continue'>;
  verify(code: string): Promise<void>;
  resend(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  requestReset(email: string): Promise<void>;
  resetPassword(code: string, password: string): Promise<void>;
}

export function authErrorMessage(error: unknown, fallback: string) {
  const failure = error as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return failure?.errors?.[0]?.longMessage || failure?.errors?.[0]?.message || failure?.message || fallback;
}
