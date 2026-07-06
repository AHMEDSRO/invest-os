import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// عميل Supabase لجهة السيرفر (API routes / Server Components)
export function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // استدعاء من Server Component — الـ middleware بيجدد الجلسة
          }
        },
      },
    }
  );
}
