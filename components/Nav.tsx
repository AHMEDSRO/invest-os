'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';

const LINKS = [
  { href: '/', label: 'الداشبورد', icon: '🏠' },
  { href: '/money', label: 'الفلوس', icon: '💰' },
  { href: '/market', label: 'السوق', icon: '📈' },
  { href: '/portfolio', label: 'المحفظة', icon: '📊' },
  { href: '/deposits', label: 'الإيداعات', icon: '➕' },
  { href: '/chat', label: 'المستشار', icon: '💬' },
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
    <>
      {/* الشريط الجانبي — سطح المكتب (يمين الشاشة) */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950/90 p-4 md:flex">
        <span className="mb-6 px-1 text-lg font-bold text-amber-400">
          Invest-OS
        </span>
        <nav className="flex flex-1 flex-col gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                pathname === l.href
                  ? 'bg-zinc-800 text-amber-300'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-red-400"
        >
          <span>🚪</span> خروج
        </button>
      </aside>

      {/* الشريط العلوي — موبايل */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur md:hidden">
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-2.5">
          <span className="ml-2 whitespace-nowrap text-base font-bold text-amber-400">
            Invest-OS
          </span>
          <nav className="flex flex-1 items-center gap-0.5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
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
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-red-400"
          >
            خروج
          </button>
        </div>
      </header>
    </>
  );
}
