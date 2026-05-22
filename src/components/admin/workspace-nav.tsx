const items = [
  { id: 'settings', label: '1. 賽事設定' },
  { id: 'teams', label: '2. 隊伍報名' },
  { id: 'groups', label: '3. 分組' },
  { id: 'matches', label: '4. 賽程' },
  { id: 'scoring', label: '5. 計分' },
];

export function WorkspaceNav() {
  return (
    <nav className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-background/80 px-4 py-2 backdrop-blur">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          className="whitespace-nowrap rounded-md px-3 py-1 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
