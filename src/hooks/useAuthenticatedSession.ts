import { useBloomIdentity } from "./useBloomIdentity";

/** Private upload caches are scoped to the actual provider session. */
export function useAuthenticatedSession() {
  const { user, sessionKey } = useBloomIdentity();
  return { user, sessionKey };
}
