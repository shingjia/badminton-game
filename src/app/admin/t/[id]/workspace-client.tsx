'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTournamentSocket } from '@/lib/use-socket';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SectionSettings } from '@/components/admin/section-settings';
import { SectionCourts } from '@/components/admin/section-courts';
import { SectionPlayers } from '@/components/admin/section-players';
import { SectionGroups } from '@/components/admin/section-groups';
import { SectionMatches } from '@/components/admin/section-matches';
import { SectionScoring } from '@/components/admin/section-scoring';
import type { Tournament } from '@prisma/client';

// 每個分頁一個代表色，跟各 Section 卡片的左邊色條對應，
// 點到哪個 tab 一眼就看得出來（active 態用同色底色 + 深色字）。
const TABS = [
  {
    id: 'settings',
    label: '賽事設定',
    active:
      'data-[state=active]:bg-slate-200 data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100',
  },
  {
    id: 'teams',
    label: '報名',
    active:
      'data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900 dark:data-[state=active]:bg-blue-900/50 dark:data-[state=active]:text-blue-200',
  },
  {
    id: 'groups',
    label: '分組',
    active:
      'data-[state=active]:bg-purple-100 data-[state=active]:text-purple-900 dark:data-[state=active]:bg-purple-900/50 dark:data-[state=active]:text-purple-200',
  },
  {
    id: 'courts',
    label: '場地',
    active:
      'data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 dark:data-[state=active]:bg-orange-900/50 dark:data-[state=active]:text-orange-200',
  },
  {
    id: 'matches',
    label: '賽程',
    active:
      'data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-900 dark:data-[state=active]:bg-emerald-900/50 dark:data-[state=active]:text-emerald-200',
  },
  {
    id: 'scoring',
    label: '計分',
    active:
      'data-[state=active]:bg-red-100 data-[state=active]:text-red-900 dark:data-[state=active]:bg-red-900/50 dark:data-[state=active]:text-red-200',
  },
] as const;

export function WorkspaceClient({
  tournamentId,
  initialTournament,
}: {
  tournamentId: string;
  initialTournament: Tournament;
}) {
  const router = useRouter();
  const [tournament, setTournament] = useState(initialTournament);
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  useTournamentSocket(tournamentId, {
    'player.added': bump,
    'player.updated': bump,
    'player.deleted': bump,
    'groups.generated': bump,
    'pairs.shuffled': bump,
    'pairing.locked': () => {
      bump();
      router.refresh();
    },
    'match.generated': bump,
    // 'match.scored' 故意不接 bump()：接了會讓 SectionScoring 對每一次
    // 計分都額外觸發一次整包 GET，這個 GET 跟 ScoreRow 自己送出的 PATCH
    // 用同一個 tournament.id 競爭，回應如果剛好在連續兩次 PATCH 都送出
    // 後才 resolve，會用中間值蓋掉已經正確的樂觀值，造成分數先升後降
    // 再升。SectionScoring 現在直接訂閱 match.scored、用廣播本身帶的
    // 單場資料 merge，不需要（也不該）再靠這裡的整包重新 GET。
    'tournament.updated': (payload: { tournament: Tournament }) => {
      setTournament(payload.tournament);
      bump();
    },
  });

  return (
    <Tabs defaultValue="settings">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className={t.active}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="settings" className="mt-6">
        <SectionSettings tournament={tournament} />
      </TabsContent>
      <TabsContent value="teams" className="mt-6">
        <SectionPlayers tournament={tournament} revision={revision} />
      </TabsContent>
      <TabsContent value="groups" className="mt-6">
        <SectionGroups tournament={tournament} revision={revision} />
      </TabsContent>
      <TabsContent value="courts" className="mt-6">
        <SectionCourts tournament={tournament} />
      </TabsContent>
      <TabsContent value="matches" className="mt-6">
        <SectionMatches tournament={tournament} revision={revision} />
      </TabsContent>
      <TabsContent value="scoring" className="mt-6">
        <SectionScoring tournament={tournament} revision={revision} />
      </TabsContent>
    </Tabs>
  );
}
