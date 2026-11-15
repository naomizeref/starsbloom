import type { ComponentType } from 'react';
import { CLERK_ENABLED } from './authConfig';

export const isAuthPage = (pathname: string) => /^\/(auth|login|register)\/?$/.test(pathname);
export const isPublicEntry = (pathname: string) => pathname === '/' || isAuthPage(pathname);

// Fetch the form alongside Clerk's network initialization, not after it.
export const loadAuthPage = () => CLERK_ENABLED
  ? import('../pages/ClerkAuthPage').then(m => ({ default: m.ClerkAuthPage as ComponentType<any> }))
  : import('../pages/AuthPage').then(m => ({ default: m.AuthPage }));
