import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';

const cairo = Cairo({ subsets: ['arabic', 'latin'] });

export const metadata: Metadata = {
  title: 'Invest-OS — نظامي الاستثماري',
  description: 'نظام استثماري شخصي: مصر × الإمارات',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body
        className={`${cairo.className} min-h-screen bg-zinc-950 bg-[radial-gradient(ellipse_at_top,rgba(212,160,23,0.06),transparent_60%)] text-zinc-100 antialiased`}
      >
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">{children}</main>
      </body>
    </html>
  );
}
