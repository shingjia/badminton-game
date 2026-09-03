type Scores = { scoreA: number; scoreB: number };

/**
 * 會內賽接力帶分：第 N 段分數異動後，決定第 N+1 段的起始分要不要跟著動。
 * 回傳 null = 不動下一段。
 * - 本段完賽 → 下一段還沒動過（0:0）或還停在上一次帶入的起始分 → 帶入新結束分
 * - 下一段已自行推進（已在計分）→ 不覆蓋，避免洗掉進行中的分數
 * - 本段從完賽被改回進行中（誤按修正）→ 下一段若還停在帶入值，歸零收回
 */
export function carryToNext(
  prev: Scores & { status: string },
  newScores: Scores,
  newStatus: string,
  next: (Scores & { status: string }) | null,
): Scores | null {
  if (!next || next.status !== 'pending') return null;
  const untouched = next.scoreA === 0 && next.scoreB === 0;
  const atPrevCarry = next.scoreA === prev.scoreA && next.scoreB === prev.scoreB;
  if (newStatus === 'completed' && (untouched || atPrevCarry)) {
    return { scoreA: newScores.scoreA, scoreB: newScores.scoreB };
  }
  if (newStatus === 'pending' && prev.status === 'completed' && atPrevCarry && !untouched) {
    return { scoreA: 0, scoreB: 0 };
  }
  return null;
}
