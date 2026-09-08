'use client';

import { useEffect, useRef, useState } from 'react';
import type { Group, Match, Pair, Player } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
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
 *
 * `matches` (the same block's list) enables the side arrows to jump to
 * the previous/next match without leaving fullscreen.
 */
export function FullscreenMatchButton({
  match,
  matches,
  format,
  pointsPerGame,
}: {
  match: MatchLike;
  matches: MatchLike[];
  format: 'friendly' | 'club';
  pointsPerGame: number;
}) {
  const [active, setActive] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Static per-browser capability, safe to read directly in render — it
  // never changes at runtime and doesn't affect the rendered DOM shape
  // (only event-handler behavior), so there's no hydration mismatch risk.
  const supportsFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  const ordered = [...matches].sort(
    (a, b) => a.roundNumber - b.roundNumber || a.matchOrder - b.matchOrder,
  );
  // 依 id 從最新的 props 找目前顯示的場次，分數更新才會即時反映
  const shown = ordered.find((m) => m.id === (currentId ?? match.id)) ?? match;
  const idx = ordered.findIndex((m) => m.id === shown.id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const target = format === 'club' ? shown.matchOrder * pointsPerGame : null;
  // 循環的最後一段沒有「換人」——打到目標分就是整場結束
  const isFinal = format === 'club' && idx >= 0 && idx === ordered.length - 1;

  useEffect(() => {
    if (!supportsFullscreen) return;
    function onChange() {
      const isActive = document.fullscreenElement === overlayRef.current;
      setActive(isActive);
      if (!isActive) setCurrentId(null);
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
    overlayRef.current?.requestFullscreen().catch((e) => {
      console.warn('[fullscreen] requestFullscreen rejected, falling back to CSS overlay:', e);
      setActive(true);
    });
  }

  function close() {
    if (document.fullscreenElement) {
      // Real fullscreen: let the fullscreenchange listener drive `active`
      // back to false once the browser actually exits, not before.
      document.exitFullscreen().catch(() => {});
    } else {
      // CSS-fallback path never entered real fullscreen, so there's no
      // fullscreenchange event coming — close it directly.
      setActive(false);
      setCurrentId(null);
    }
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
          <div className="text-xl font-medium text-white/70 sm:text-3xl lg:text-5xl">{shown.pairA.group.name} 組</div>
          <div className="text-3xl font-semibold sm:text-5xl lg:text-7xl xl:text-8xl">{pairLabel(shown.pairA)}</div>
          <div className="font-mono text-6xl font-bold tabular-nums sm:text-8xl lg:text-[15rem] xl:text-[18rem]">{shown.scoreA}</div>
          {next && (
            <div className="text-base text-white/60 sm:text-xl lg:text-3xl">下一組：{pairLabel(next.pairA)}</div>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-rose-950 text-center">
          <div className="text-xl font-medium text-white/70 sm:text-3xl lg:text-5xl">{shown.pairB.group.name} 組</div>
          <div className="text-3xl font-semibold sm:text-5xl lg:text-7xl xl:text-8xl">{pairLabel(shown.pairB)}</div>
          <div className="font-mono text-6xl font-bold tabular-nums sm:text-8xl lg:text-[15rem] xl:text-[18rem]">{shown.scoreB}</div>
          {next && (
            <div className="text-base text-white/60 sm:text-xl lg:text-3xl">下一組：{pairLabel(next.pairB)}</div>
          )}
        </div>
        <div
          style={{ top: 'max(1.5rem, env(safe-area-inset-top))' }}
          className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
        >
          {target != null && (
            <div className="rounded-full border border-white/30 bg-black/50 px-5 py-2 text-xl font-semibold sm:text-2xl lg:text-3xl">
              {target}分{isFinal ? '結束' : '換人'}
            </div>
          )}
          {shown.status === 'completed' && (
            <div className="rounded-full bg-emerald-600 px-5 py-2 text-xl font-semibold sm:text-2xl lg:text-3xl">
              {isFinal ? '比賽結束' : '已完賽'}
            </div>
          )}
        </div>
        {prev && (
          <button
            type="button"
            onClick={() => setCurrentId(prev.id)}
            title="上一組"
            aria-label="上一組"
            className="absolute left-2 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-4xl text-white/60 hover:bg-black/40 hover:text-white sm:left-4"
          >
            ‹
          </button>
        )}
        {next && (
          <button
            type="button"
            onClick={() => setCurrentId(next.id)}
            title="下一組"
            aria-label="下一組"
            className="absolute right-2 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-4xl text-white/60 hover:bg-black/40 hover:text-white sm:right-4"
          >
            ›
          </button>
        )}
        <button
          type="button"
          onClick={close}
          style={{ bottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          className="absolute left-1/2 -translate-x-1/2 rounded border border-white/30 bg-black/40 px-4 py-2 text-sm hover:bg-white/10"
        >
          離開全螢幕
        </button>
      </div>
    </>
  );
}
