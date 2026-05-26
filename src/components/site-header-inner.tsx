import { BrandLink } from '@/components/brand-link';
import { HeaderAction } from '@/components/header-action';
import { getSiteConfig } from '@/lib/site-config';

export async function SiteHeaderInner() {
  const config = await getSiteConfig();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <BrandLink className="flex items-center gap-2">
          {config.siteIconImage ? (
            <img
              src={`/api/uploads/${config.siteIconImage}`}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              {config.siteIcon}
            </span>
          )}
          <span className="text-lg font-semibold tracking-tight">{config.siteName}</span>
        </BrandLink>
        <HeaderAction />
      </div>
    </header>
  );
}
