import { useContext, useEffect, useState } from "react";
import { BloomIdentityContext, type BloomIdentity } from "../context/BloomIdentityContext";
import { useSupabaseClient } from "../lib/supabase";
import { CLERK_ENABLED } from "../lib/authConfig";

export function useBloomIdentity(): BloomIdentity {
  const clerk = useContext(BloomIdentityContext);
  const client = useSupabaseClient();
  const [legacy, setLegacy] = useState<BloomIdentity>({ user: null, session: null, authLoaded: false, sessionKey: "signed-out" });
  useEffect(() => {
    if (CLERK_ENABLED) return;
    let active = true;
    let receivedEvent = false;
    const accept = (session: BloomIdentity["session"]) => {
      if (active) setLegacy({ session, user: session?.user ?? null, authLoaded: true,
        sessionKey: session ? `${session.user.id}:${session.user.last_sign_in_at || ""}` : "signed-out" });
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true;
      accept(session);
    });
    void client.auth.getSession().then(({ data }) => { if (!receivedEvent) accept(data.session); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  if (CLERK_ENABLED && !clerk) throw new Error("Bloom's Clerk provider is missing.");
  return CLERK_ENABLED ? clerk! : legacy;
}
