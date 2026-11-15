import { createContext } from "react";
import type { User, Session } from "@supabase/supabase-js";

export type BloomIdentity = {
  user: User | null;
  session: Session | null;
  authLoaded: boolean;
  sessionKey: string;
};
export const BloomIdentityContext = createContext<BloomIdentity | null>(null);
