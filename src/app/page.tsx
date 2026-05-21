export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
      <div className="max-w-xl w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          系統運作中
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          羽球賽事系統
        </h1>

        <p className="text-slate-600 dark:text-slate-400">
          Badminton Tournament System
        </p>

        <div className="pt-4 text-sm text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-slate-800">
          <p>後端與賽事管理介面尚未完成。</p>
          <p className="mt-1">此頁為部署驗證用占位頁，將於 Plan 2 階段以正式介面取代。</p>
        </div>
      </div>
    </main>
  );
}
