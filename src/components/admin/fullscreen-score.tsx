'use client';

import { useEffect, useLayoutEffect, useRef, useState, forwardRef } from 'react';

type Side = 'A' | 'B';

const SIDE_STYLE: Record<Side, string> = {
  A: 'bg-blue-950',
  B: 'bg-rose-950',
};

// ponytail: transform-gpu forces this panel onto its own GPU-composited
// layer. This is a HYPOTHESIS, not a confirmed root cause -- no cited
// WebKit bug backs it, and background-color changes don't normally
// trigger layer promotion in WebKit's compositing model, so this may
// not actually be why the glitch happens. It's a cheap, low-risk,
// commonly-reached-for workaround for the reported symptom pattern
// (first swap only leaves stale color at the outer screen edges,
// doesn't self-correct on scroll, fine on the second swap -- confirmed
// via real-device retest after the key-stability fix in ae7722b did
// NOT resolve it). If this ALSO doesn't fix it on retest, don't guess
// a third CSS tweak -- get real evidence first: Safari Web Inspector
// via a Mac (Develop menu -> connected iPhone -> Layers tab / "show
// compositing borders" / inspect repaint rects), or at minimum a
// screen recording of the glitch.
const ScoreSide = forwardRef<
  HTMLDivElement,
  {
    side: Side;
    label: string;
    score: number;
    bg: string;
    onBump: (side: Side, delta: number) => void;
    nextLabel?: string;
  }
>(function ScoreSide({ side, label, score, bg, onBump, nextLabel }, ref) {
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={() => onBump(side, 1)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBump(side, 1);
        }
      }}
      className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 text-center transform-gpu ${bg}`}
    >
      <div className="text-2xl font-semibold sm:text-3xl lg:text-6xl xl:text-7xl">{label}</div>
      <div className="font-mono text-6xl font-bold tabular-nums sm:text-9xl lg:text-[14rem] xl:text-[17rem]">{score}</div>
      <div className="mt-4 flex items-center gap-6">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBump(side, -1);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white/10 text-3xl hover:bg-white/20 lg:h-20 lg:w-20 lg:text-5xl"
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
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white/10 text-3xl hover:bg-white/20 lg:h-20 lg:w-20 lg:text-5xl"
          aria-label={`${side} +1`}
        >
          +
        </button>
      </div>
      {nextLabel && (
        <div className="mt-2 text-base text-white/60 sm:text-xl lg:text-3xl">
          下一組：{nextLabel}
        </div>
      )}
    </div>
  );
});
ScoreSide.displayName = 'ScoreSide';

/**
 * 管理者計分頁的全螢幕計分面板——跟觀眾頁的 FullscreenMatchButton
 * （viewer/fullscreen-match.tsx）用同一套技術（原生 Fullscreen API、iOS
 * Safari/Chrome 不支援時的純 CSS 覆蓋層 fallback、窄螢幕響應式版面、
 * close 依「是否真的進了瀏覽器全螢幕」分流避免退出時閃一下），但這個
 * 版本可以互動：點半面螢幕任何地方都會 +1，兩顆半透明按鈕可以精準
 * +1/−1（按鈕要 stopPropagation，不然會跟整面點擊疊加變成 +2）。
 *
 * 受控元件：父層（BlockSection）決定顯示哪一場、提供 onPrev/onNext
 * 讓左右箭頭在不離開全螢幕的情況下切換上一場/下一場。計分邏輯不在
 * 這裡寫，父層把目前場次的 bump 傳進來。
 */
export function FullscreenScorePanel({
  open,
  labelA,
  labelB,
  scoreA,
  scoreB,
  target,
  completed,
  isFinal,
  nextLabelA,
  nextLabelB,
  onBump,
  onClose,
  onPrev,
  onNext,
}: {
  open: boolean;
  labelA: string;
  labelB: string;
  scoreA: number;
  scoreB: number;
  target?: number | null;
  completed?: boolean;
  isFinal?: boolean;
  nextLabelA?: string;
  nextLabelB?: string;
  onBump: (side: Side, delta: number) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [active, setActive] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const slot1Ref = useRef<HTMLDivElement>(null);
  const slot2Ref = useRef<HTMLDivElement>(null);
  const lastSwapAtRef = useRef(0);
  const supportsFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  useEffect(() => {
    if (!open) return;
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
  }, [open, supportsFullscreen]);

  useEffect(() => {
    if (!supportsFullscreen) return;
    function onChange() {
      const isActive = document.fullscreenElement === overlayRef.current;
      setActive(isActive);
      // Esc（瀏覽器原生退出）也要通知父層收掉面板
      if (!isActive && open) onClose();
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [supportsFullscreen, open, onClose]);

  function close() {
    if (document.fullscreenElement) {
      // Real fullscreen: let the fullscreenchange listener drive `active`
      // back to false once the browser actually exits, not before.
      document.exitFullscreen().catch(() => {});
    } else {
      // CSS-fallback path never entered real fullscreen, so there's no
      // fullscreenchange event coming — close it directly.
      setActive(false);
      onClose();
    }
  }

  function toggleSwap() {
    const now = performance.now();
    // ponytail: debounce rapid re-taps. A video recording of the reported
    // bug showed the glitch specifically during 3 swaps inside under 2
    // seconds -- real usage (physically swapping court sides mid-match)
    // never needs rapid repeated taps, so this directly prevents the
    // observed trigger condition regardless of whether the underlying
    // WebKit paint-coalescing defect itself is ever fully eliminated.
    // performance.now() (monotonic) instead of Date.now() (wall-clock,
    // can jump backward on NTP resync and would then block swaps until
    // wall-clock time caught back up).
    if (now - lastSwapAtRef.current < 500) return;
    lastSwapAtRef.current = now;
    setSwapped((s) => !s);
  }

  useLayoutEffect(() => {
    // ponytail: forces a synchronous layout recalculation right after
    // the swap commits (offsetHeight is a documented layout-forcing
    // read). This is a HYPOTHESIS, not a verified fix -- offsetHeight
    // is documented to force layout/reflow, not paint/composite, which
    // are separate rendering pipeline stages. There's no documented
    // guarantee this flushes the paint-only background-color change
    // that the video evidence showed WebKit sometimes drops. Cheap and
    // harmless either way; still needs real-device retest to know if
    // it actually helps.
    void slot1Ref.current?.offsetHeight;
    void slot2Ref.current?.offsetHeight;
  }, [swapped]);

  // ponytail: keyed by DOM slot, not by logical side, so a swap only
  // updates props on two stationary elements instead of making React
  // physically move the DOM nodes. Reordering (key={side}) caused a real
  // rendering glitch on iOS Safari: a fixed-position overlay with
  // DOM-reordered flex children left stale, unrepainted color at the
  // outer panel edges right after a swap (reported on iPhone).
  const firstSide: Side = swapped ? 'B' : 'A';
  const secondSide: Side = swapped ? 'A' : 'B';
  const labelOf: Record<Side, string> = { A: labelA, B: labelB };
  const scoreOf: Record<Side, number> = { A: scoreA, B: scoreB };
  const nextOf: Record<Side, string | undefined> = { A: nextLabelA, B: nextLabelB };

  return (
    <div
      ref={overlayRef}
      className={`text-white ${active ? 'fixed inset-0 z-50 flex flex-col sm:flex-row' : 'hidden'}`}
    >
      {/*
        ponytail: key includes `swapped` so every toggle fully unmounts the
        old panel and mounts a brand-new one, instead of updating an existing
        node's className in place. This is the THIRD fix attempt for a
        real-device-confirmed WebKit paint glitch (wrong color at the outer
        screen edges after swap) -- attempts 1 (ae7722b, avoid DOM reorder)
        and 2 (330ad46/e54965e, transform-gpu early layer promotion) did NOT
        fix it on retest. A diagnostic screenshot (via the temporary panel
        below) proved the underlying DOM/CSSOM state is 100% correct at the
        moment of the glitch -- exact right background-color, exact right
        position, zero gap -- meaning this is a pure WebKit repaint defect,
        not a logic bug. A freshly-created DOM node's first paint has no
        stale prior color to incorrectly carry over, which sidesteps the
        specific operation (updating an EXISTING node's style) that both
        prior attempts still relied on and that WebKit seems to botch here.
      */}
      <ScoreSide
        key={`slot-1-${swapped}`}
        ref={slot1Ref}
        side={firstSide}
        label={labelOf[firstSide]}
        score={scoreOf[firstSide]}
        bg={SIDE_STYLE[firstSide]}
        onBump={onBump}
        nextLabel={nextOf[firstSide]}
      />
      <ScoreSide
        key={`slot-2-${swapped}`}
        ref={slot2Ref}
        side={secondSide}
        label={labelOf[secondSide]}
        score={scoreOf[secondSide]}
        bg={SIDE_STYLE[secondSide]}
        onBump={onBump}
        nextLabel={nextOf[secondSide]}
      />
      <div
        style={{ top: 'max(1.5rem, env(safe-area-inset-top))' }}
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        {target != null && (
          <div className="rounded-full border border-white/30 bg-black/50 px-5 py-2 text-xl font-semibold sm:text-2xl lg:text-3xl">
            {target}分{isFinal ? '結束' : '換人'}
          </div>
        )}
        {completed && (
          <div className="rounded-full bg-emerald-600 px-5 py-2 text-xl font-semibold sm:text-2xl lg:text-3xl">
            {isFinal ? '比賽結束' : '已完賽'}
          </div>
        )}
      </div>
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          title="上一組"
          aria-label="上一組"
          className="absolute left-2 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-4xl text-white/60 hover:bg-black/40 hover:text-white sm:left-4"
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          title="下一組"
          aria-label="下一組"
          className="absolute right-2 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-4xl text-white/60 hover:bg-black/40 hover:text-white sm:right-4"
        >
          ›
        </button>
      )}
      <button
        type="button"
        onClick={toggleSwap}
        title="交換顯示"
        aria-label="交換顯示位置"
        className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/30 text-2xl hover:bg-white/20"
      >
        ⇄
      </button>
      <button
        type="button"
        onClick={close}
        style={{ bottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        className="absolute left-1/2 -translate-x-1/2 rounded border border-white/30 bg-black/40 px-4 py-2 text-sm hover:bg-white/10"
      >
        離開全螢幕
      </button>
    </div>
  );
}
