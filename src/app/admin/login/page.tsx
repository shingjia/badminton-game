import { LoginForm } from '@/components/admin/login-form';

export default function AdminLoginPage({ searchParams }: { searchParams: { redirect?: string } }) {
  return (
    <main className="container mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">主辦登入</h1>
      <LoginForm redirect={searchParams.redirect ?? '/admin'} />
    </main>
  );
}
