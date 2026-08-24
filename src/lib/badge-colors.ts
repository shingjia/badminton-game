// 固定色盤，讓同一組／同一場地在賽程頁、計分頁、觀眾頁三個畫面顏色都
// 一樣。用 0-based index（displayOrder - 1）挑色，超過色盤數量就循環
// 取模——現實賽事的組數/場地數不會超過，循環情況很少見。
const PALETTE = [
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-lime-100 text-lime-800 border-lime-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
];

export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length];
}
