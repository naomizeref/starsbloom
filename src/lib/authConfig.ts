// Opt in only after the identity migration and Clerk/Supabase integration are ready.
export const CLERK_ENABLED = import.meta.env.VITE_AUTH_PROVIDER === "clerk";
