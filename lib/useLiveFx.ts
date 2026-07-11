'use client';

import { useEffect, useState } from 'react';
import { todayISO } from './format';
import { getSupabase } from './supabase/client';

const REFRESH_MS = 6 * 60 * 60 * 1000; // كل 6 ساعات لو الصفحة فاضلة مفتوحة (استمرار)

// سعر AED/EGP حي من open.er-api.com — بيتحدث تلقائيًا عند كل فتح
// وكل بضع ساعات لو الصفحة فاضلة، وبيتسجل في fx_history بتاريخ اليوم
export function useLiveFx(fallback: number): number {
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/AED');
        const data = await res.json();
        const egp = Number(data?.rates?.EGP);
        if (!egp || cancelled) return;
        setRate(egp);
        await getSupabase()
          .from('fx_history')
          .upsert({ date: todayISO(), aed_egp: egp });
      } catch {
        // نفشل بصمت ونستخدم آخر سعر مخزّن (fallback)
      }
    }

    fetchRate();
    const interval = setInterval(fetchRate, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return rate ?? fallback;
}
