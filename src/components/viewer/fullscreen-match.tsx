'use client';

import { useEffect, useRef, useState } from 'react';
import type { Match, Pair, Player } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player };
type MatchLike = Match & { pairA: PairWithPlayers; pairB: PairWithPlayers };

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

/**
 * A button that puts a dedicated big-score overlay into the browser's
 * native fullscreen — for showing one in-progress match on a TV/projector.
 * Esc (browser-native) exits fullscreen without going through the close
 * button, so this listens for `fullscreenchange` rather than tracking
 * state purely from click handlers.
 *
 * iOS Safari/Chrome (both WebKit, per Apple's App Store policy) don't
 * support requestFullscreen() on ordinary elements — only <video>. When
 * unsupported, this falls back to a CSS-only overlay that still fills the
 * viewport (just doesn't hide the browser's own address bar/chrome) —
 * the goal (a big, readable score display) still works everywhere, even
 * without the real Fullscreen API.
 */
export function FullscreenMatchButton({ match }: { match: MatchLike }) {
  const [active, setActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Static per-browser capability, safe to read directly in render — it
  // never changes at runtime and doesn't affect the rendered DOM shape
  // (only event-handler behavior), so there's no hydration mismatch risk.
  const supportsFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  useEffect(() => {
    if (!supportsFullscreen) return;
    function onChange() {
      setActive(document.fullscreenElement === overlayRef.current);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [supportsFullscreen]);

  function open() {
    if (!supportsFullscreen) {
      setActive(true);
      return;
    }
    // ponytail: if requestFullscreen() still somehow rejects (e.g. some
    // permissions-policy edge case) fall back to the CSS-only overlay
    // rather than silently doing nothing.
    overlayRef.current?.requestFullscreen().catch(() => setActive(true));
  }

  function close() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setActive(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="全螢幕放大"
        aria-label="全螢幕放大"
        className="flex h-8 w-8 items-center justify-center rounded border text-sm hover:bg-muted"
      >
        ⛶
      </button>
      <div
        ref={overlayRef}
        className={`text-white ${active ? 'fixed inset-0 z-50 flex flex-col sm:flex-row' : 'hidden'}`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-blue-950 text-center">
          <div className="text-2xl font-semibold sm:text-3xl">{pairLabel(match.pairA)}</div>
          <div className="font-mono text-6xl font-bold tabular-nums sm:text-8xl">{match.scoreA}</div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-rose-950 text-center">
          <div className="text-2xl font-semibold sm:text-3xl">{pairLabel(match.pairB)}</div>
          <div className="font-mono text-6xl font-bold tabular-nums sm:text-8xl">{match.scoreB}</div>
        </div>
        <button
          type="button"
          onClick={close}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded border border-white/30 bg-black/40 px-4 py-2 text-sm hover:bg-white/10"
        >
          離開全螢幕
        </button>
      </div>
    </>
  );
}
