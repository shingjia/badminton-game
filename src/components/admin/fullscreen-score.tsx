'use client';

import { useEffect, useRef, useState } from 'react';

type Side = 'A' | 'B';

function ScoreSide({
  side,
  label,
  score,
  bg,
  onBump,
}: {
  side: Side;
  label: string;
  score: number;
  bg: string;
  onBump: (side: Side, delta: number) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onBump(side, 1)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBump(side, 1);
        }
      }}
      className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 text-center ${bg}`}
    >
      <div className="text-2xl font-semibold sm:text-3xl">{label}</div>
      <div className="font-mono text-6xl font-bold tabular-nums sm:text-9xl">{score}</div>
      <div className="mt-4 flex items-center gap-6">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBump(side, -1);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white/10 text-3xl hover:bg-white/20"
          aria-label={`${side} -1`}
        >
          −
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBump(side, 1);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white/10 text-3xl hover:bg-white/20"
          aria-label={`${side} +1`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * 管理者計分頁的全螢幕計分——跟觀眾頁唯讀的 FullscreenMatchButton
 * （viewer/fullscreen-match.tsx）用同一套技術（原生 Fullscreen API、iOS
 * Safari/Chrome 不支援時的純 CSS 覆蓋層 fallback、窄螢幕響應式版面、
 * close() 依「是否真的進了瀏覽器全螢幕」分流避免退出時閃一下），但這個
 * 版本可以互動：點半面螢幕任何地方都會 +1，兩顆半透明按鈕可以精準
 * +1/−1（按鈕要 stopPropagation，不然會跟整面點擊疊加變成 +2）。
 * 計分邏輯不在這裡寫，呼叫端（ScoreRow）把自己的 bump 傳進來就好。
 */
export function FullscreenScoreButton({
  labelA,
  labelB,
  scoreA,
  scoreB,
  onBump,
}: {
  labelA: string;
  labelB: string;
  scoreA: number;
  scoreB: number;
  onBump: (side: Side, delta: number) => void;
}) {
  const [active, setActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
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
    overlayRef.current?.requestFullscreen().catch((e) => {
      console.warn('[fullscreen] requestFullscreen rejected, falling back to CSS overlay:', e);
      setActive(true);
    });
  }

  function close() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      setActive(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="全螢幕計分"
        aria-label="全螢幕計分"
        className="flex h-8 w-8 items-center justify-center rounded border text-sm hover:bg-muted"
      >
        ⛶
      </button>
      <div
        ref={overlayRef}
        className={`text-white ${active ? 'fixed inset-0 z-50 flex flex-col sm:flex-row' : 'hidden'}`}
      >
        <ScoreSide side="A" label={labelA} score={scoreA} bg="bg-blue-950" onBump={onBump} />
        <ScoreSide side="B" label={labelB} score={scoreB} bg="bg-rose-950" onBump={onBump} />
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
