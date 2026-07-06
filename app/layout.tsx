import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Invest-OS — نظامي الاستثماري',
  description: 'نظام استثماري شخصي: مصر × الإمارات',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">{children}</main>
      </body>
    </html>
  );
}
