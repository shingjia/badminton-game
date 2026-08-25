import { useEffect, type DependencyList } from 'react';

/**
 * Like `useEffect`, but `run` receives an `isCancelled()` check — call it
 * right before any `setState` inside an async callback, and bail if it
 * returns true.
 *
 * Why: a plain `useEffect(() => { api(...).then(setX) }, [..., revision])`
 * has no protection against out-of-order responses. If `revision` changes
 * rapidly (e.g. several matches scored in quick succession), multiple
 * fetches can be in flight at once, and whichever happens to RESOLVE LAST
 * wins via `setState` — even if it was triggered by an OLDER `revision`
 * and is now stale relative to a fetch that already resolved with fresher
 * data. That's exactly what caused visible score flicker (new value →
 * reverts to an old value → jumps forward again).
 *
 * React calls this effect's cleanup (which flips the flag) right before
 * re-running it for a new set of deps — i.e. exactly when a newer request
 * has superseded this one — so gating every `setState` behind
 * `!isCancelled()` makes a stale response a no-op instead of a clobber.
 */
export function useSafeEffect(
  run: (isCancelled: () => boolean) => void,
  deps: DependencyList,
) {
  useEffect(() => {
    let cancelled = false;
    run(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
