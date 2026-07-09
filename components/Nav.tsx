'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';

const LINKS = [
  { href: '/', label: 'الداشبورد' },
  { href: '/market', label: 'السوق' },
  { href: '/portfolio', label: 'المحفظة' },
  { href: '/deposits', label: 'الإيداعات' },
  { href: '/chat', label: 'المستشار' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return null;

  async function logout() {
    await getSupabase().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 py-2.5 md:px-6 md:py-3">
        <span className="ml-2 whitespace-nowrap text-base font-bold text-amber-400 md:ml-4 md:text-lg">
          Invest-OS
        </span>
        <nav className="flex flex-1 items-center gap-0.5 md:gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors md:px-3 md:text-sm ${
                pathname === l.href
                  ? 'bg-zinc-800 text-amber-300'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={logout}
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-red-400 md:px-3 md:text-sm"
        >
          خروج
        </button>
      </div>
    </header>
  );
}
