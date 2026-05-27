import Link from 'next/link';
import type { Tournament } from '@prisma/client';
import { siteIconImageUrl } from '@/lib/site-config';

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
  const iconUrl = siteIconImageUrl(tournament.bannerIconImage);
  return (
    <header className={`sticky top-0 z-40 ${bg} overflow-hidden text-white shadow`}>
      {/* 細斜紋紋理 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent 0 10px, rgba(255,255,255,0.85) 10px 11px)',
        }}
      />
      {/* 右上角柔光暈 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.65), rgba(255,255,255,0))',
        }}
      />
      {/* 左下角微弱暗角，讓文字更跳 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -bottom-32 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(0,0,0,0.45), rgba(0,0,0,0))',
        }}
      />
      <div className="relative container mx-auto max-w-5xl px-4 py-3">
        <Link
          href="/"
          aria-label="回到賽事列表"
          className="flex items-center gap-3 transition hover:opacity-90"
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full border-2 border-amber-300 bg-white object-cover shadow-md"
            />
          ) : (
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl shadow-md ${ring}`}>
              {tournament.bannerIcon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {tournament.bannerTagline.trim() !== '' && (
              <div className="text-xs font-semibold tracking-wider text-amber-300 drop-shadow-sm">
                {tournament.bannerTagline}
              </div>
            )}
            <div className="truncate text-xl font-bold leading-tight drop-shadow-sm">
              {tournament.name}
            </div>
            {tournament.bannerSubtitle.trim() !== '' && (
              <div className={`text-xs ${sub}`}>{tournament.bannerSubtitle}</div>
            )}
          </div>
        </Link>
      </div>
    </header>
  );
}
