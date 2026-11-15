import { useEffect, useState, useCallback, useRef } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useSupabaseClient, ensureUserRow } from "../lib/supabase";

import { useBloomIdentity } from "./useBloomIdentity";

export interface CurrentUserProfile {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  status: string;
  balance: number;
}

/**
 * Single source of truth for "who is signed in and are they an admin" —
 * backed by the configured identity provider + the database `users` table.
 */
export function useCurrentUser() {
  const supabase = useSupabaseClient();
  const { user: authUser, session, authLoaded } = useBloomIdentity();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const identity = useRef<string | null>(null);
  const request = useRef(0);

  const fetchProfileForUser = useCallback(async (user: SupabaseUser) => {
    const version = ++request.current;
    const isCurrent = () => request.current === version && identity.current === user.id;
    setProfileLoading(true);
    try {
      // Ensure row exists
      await ensureUserRow(supabase, user);

      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await supabase
          .from("users")
          .select("id, email, name, role, status, balance")
          .eq("id", user.id)
          .maybeSingle();

        if (!isCurrent()) return;
        if (data) {
          setProfile(data as CurrentUserProfile);
          setLoadedProfileId(user.id);
          setProfileLoading(false);
          return;
        }
        if (error) {
          console.warn(`useCurrentUser: profile fetch attempt ${attempt + 1} failed`, error);
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }

    } catch (error) { console.warn("Unable to load account profile:", error); }
    if (!isCurrent()) return;
    setProfile(null);
    setLoadedProfileId(user.id);
    setProfileLoading(false);
  }, [supabase]);

  const refetchProfile = useCallback(async () => {
    if (!authUser) return;
    await fetchProfileForUser(authUser);
  }, [authUser, fetchProfileForUser]);

  useEffect(() => {
    identity.current = authUser?.id ?? null;
    ++request.current;
    setProfile(null);
    setLoadedProfileId(null);
    if (!authUser) { setProfile(null); setProfileLoading(false); return; }
    void fetchProfileForUser(authUser);
    return () => { ++request.current; };
  }, [authUser, fetchProfileForUser]);

  const isLoggedIn = !!authUser;
  const currentProfile = profile?.id === authUser?.id ? profile : null;
  const isAdmin = currentProfile?.role === "admin";

  return {
    authLoaded,
    isLoggedIn,
    isReady: authLoaded && (!isLoggedIn || (!profileLoading && loadedProfileId === authUser.id)),
    role: isAdmin ? "admin" : (currentProfile?.role ?? "user"),
    isAdmin,
    profile: currentProfile,
    user: authUser,
    session,
    refetchProfile,
  };
}