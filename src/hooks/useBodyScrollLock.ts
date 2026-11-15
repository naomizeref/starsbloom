import { useLayoutEffect } from "react";

// Each overlay owns a token. A route reset invalidates old tokens so a stale
// cleanup cannot unlock another overlay that has since opened.
const locks = new Set<symbol>();
let restore: (() => void) | undefined;

function restoreScroll() {
  const unlock = restore;
  restore = undefined;
  unlock?.();
}

export function useBodyScrollLock(isLocked: boolean) {
  useLayoutEffect(() => {
    if (!isLocked) return;
    const token = Symbol("scroll-lock");
    if (locks.size === 0) {
      const body = document.body;
      const root = document.documentElement;
      const x = window.scrollX;
      const y = window.scrollY;
      const previous = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      const rootOverflow = root.style.overflow;
      // overflow:hidden alone does not hold the background in place when the
      // iOS keyboard opens. Freeze it at its current offset; overlays can scroll.
      Object.assign(body.style, {
        position: "fixed", top: `${-y}px`, left: `${-x}px`,
        width: "100%", overflow: "hidden",
      });
      root.style.overflow = "hidden";
      restore = () => {
        Object.assign(body.style, previous);
        root.style.overflow = rootOverflow;
        window.scrollTo({ left: x, top: y, behavior: "instant" });
      };
    }
    locks.add(token);
    return () => {
      if (locks.delete(token) && locks.size === 0) restoreScroll();
    };
  }, [isLocked]);
}

export function resetBodyScrollLock() {
  locks.clear();
  restoreScroll();
}
