import { useCallback, useEffect, useRef, useState } from "react";

const EMPTY_ROWS: never[] = [];

/** A failed read must stay distinguishable from an empty account. Writes use
 * separate RPC results: a refresh failure must never invite a second debit. */
export function useRemoteRows<T>(scope: string | null, load: () => Promise<T[]>, label: string) {
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const request = useRef(0);
  const [state, setState] = useState<{ scope: string | null; rows: T[]; loading: boolean; error: string | null }>({ scope, rows: [], loading: !!scope, error: null });
  const refresh = useCallback(async () => {
    if (!scope || currentScope.current !== scope) return;
    const version = ++request.current;
    setState(prev => ({ scope, rows: prev.scope === scope ? prev.rows : [], loading: true, error: prev.scope === scope ? prev.error : null }));
    try {
      const rows = await load();
      if (currentScope.current === scope && request.current === version) setState({ scope, rows, loading: false, error: null });
      return rows;
    } catch (error) {
      console.error(`Failed to load ${label}:`, error);
      if (currentScope.current === scope && request.current === version) setState(prev => ({ ...prev, loading: false, error: `Unable to refresh ${label}. Displayed information may be out of date. Retry before making another transaction.` }));
    }
  }, [scope, load, label]);
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    if (!scope) return;
    const timer = window.setInterval(onFocus, 30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { ++request.current; window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [scope, refresh]);
  return { rows: state.scope === scope && scope ? state.rows : EMPTY_ROWS, loading: !!scope && (state.scope !== scope || state.loading), error: state.scope === scope ? state.error : null, refresh };
}
