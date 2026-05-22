import { NextRequest, NextResponse } from 'next/server';

// We intentionally do auth at route level (requireAdmin) rather than middleware,
// because Next.js middleware runs on edge runtime and node:crypto is unavailable there.
// This middleware only redirects unauthed /admin/* page visits to /admin/login.
// (Page redirect; not for API routes — APIs return 401 JSON.)
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  if (url.pathname.startsWith('/admin') && url.pathname !== '/admin/login') {
    const cookie = req.cookies.get('admin_session')?.value;
    if (!cookie) {
      const login = url.clone();
      login.pathname = '/admin/login';
      login.searchParams.set('redirect', url.pathname);
      return NextResponse.redirect(login);
    }
    // Lightweight presence check only; cryptographic verification happens
    // on first protected request via requireAdmin.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
