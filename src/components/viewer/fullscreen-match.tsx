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
 */
export function FullscreenMatchButton({ match }: { match: MatchLike }) {
  const [active, setActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onChange() {
      setActive(document.fullscreenElement === overlayRef.current);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function open() {
    // ponytail: 不支援 Fullscreen API 的瀏覽器（極少數）— promise 會
    // reject，直接忽略即可，這是漸進增強，不是必要功能。
    overlayRef.current?.requestFullscreen().catch(() => {});
  }

  function close() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="全螢幕放大"
        aria-label="全螢幕放大"
        className="flex h-6 w-6 items-center justify-center rounded border text-xs hover:bg-muted"
      >
        ⛶
      </button>
      <div
        ref={overlayRef}
        className={`flex-col items-center justify-center gap-8 bg-slate-900 p-8 text-white ${
          active ? 'fixed inset-0 z-50 flex' : 'hidden'
        }`}
      >
        <div className="grid w-full max-w-5xl grid-cols-2 gap-8 text-center">
          <div>
            <div className="mb-4 text-3xl font-semibold">{pairLabel(match.pairA)}</div>
            <div className="font-mono text-8xl font-bold tabular-nums">{match.scoreA}</div>
          </div>
          <div>
            <div className="mb-4 text-3xl font-semibold">{pairLabel(match.pairB)}</div>
            <div className="font-mono text-8xl font-bold tabular-nums">{match.scoreB}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
        >
          離開全螢幕
        </button>
      </div>
    </>
  );
}
