import { getSiteConfig } from '@/lib/site-config';
import { BrandSettingsCard } from '@/components/admin/brand-settings-card';
import { PasswordChangeCard } from '@/components/admin/password-change-card';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const config = await getSiteConfig();
  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">管理者設定</h1>
      <BrandSettingsCard initial={config} />
      <PasswordChangeCard />
    </div>
  );
}
