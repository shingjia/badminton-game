import Link from 'next/link';
import { HeaderAction } from '@/components/header-action';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            🏸
          </span>
          <span className="text-lg font-semibold tracking-tight">羽球友誼賽</span>
        </Link>
        <HeaderAction />
      </div>
    </header>
  );
}
