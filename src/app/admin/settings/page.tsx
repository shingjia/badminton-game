import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { COOKIE_NAME, verifySession } from '@/lib/auth';
import { getSiteConfig } from '@/lib/site-config';
import { BrandSettingsCard } from '@/components/admin/brand-settings-card';
import { PasswordChangeCard } from '@/components/admin/password-change-card';
import { UserManagementCard } from '@/components/admin/user-management-card';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const config = await getSiteConfig();

  const token = cookies().get(COOKIE_NAME)?.value;
  const session = verifySession(token, process.env.SESSION_SECRET ?? '');
  const currentUser = session
    ? await prisma.adminUser.findUnique({
        where: { id: session.u },
        select: { id: true, username: true, isOwner: true },
      })
    : null;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">管理者設定</h1>
      <BrandSettingsCard initial={config} />
      {currentUser?.isOwner && <UserManagementCard currentUserId={currentUser.id} />}
      <PasswordChangeCard />
    </div>
  );
}
