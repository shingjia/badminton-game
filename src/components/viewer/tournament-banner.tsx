import type { Tournament } from '@prisma/client';

const COLOR_BG: Record<string, string> = {
  red: 'bg-red-700',
  blue: 'bg-blue-700',
  green: 'bg-emerald-700',
  purple: 'bg-purple-700',
  orange: 'bg-orange-600',
  slate: 'bg-slate-700',
};

const ICON_RING: Record<string, string> = {
  red: 'bg-amber-400 text-red-900',
  blue: 'bg-amber-400 text-blue-900',
  green: 'bg-amber-400 text-emerald-900',
  purple: 'bg-amber-400 text-purple-900',
  orange: 'bg-amber-400 text-orange-900',
  slate: 'bg-amber-400 text-slate-900',
};

const SUBTITLE_COLOR: Record<string, string> = {
  red: 'text-amber-200',
  blue: 'text-amber-200',
  green: 'text-amber-200',
  purple: 'text-amber-200',
  orange: 'text-amber-100',
  slate: 'text-amber-200',
};

export function TournamentBanner({ tournament }: { tournament: Tournament }) {
  const bg = COLOR_BG[tournament.bannerColor] ?? COLOR_BG.red;
  const ring = ICON_RING[tournament.bannerColor] ?? ICON_RING.red;
  const sub = SUBTITLE_COLOR[tournament.bannerColor] ?? SUBTITLE_COLOR.red;
  return (
    <header className={`sticky top-0 z-40 ${bg} text-white shadow`}>
      <div className="container mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl ${ring}`}>
          {tournament.bannerIcon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-wider text-amber-300">
            FRIENDLY MATCH ★ 友誼賽
          </div>
          <div className="truncate text-xl font-bold leading-tight">{tournament.name}</div>
          <div className={`text-xs ${sub}`}>雙打分組循環賽</div>
        </div>
      </div>
    </header>
  );
}
