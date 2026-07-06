'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from './supabase/client';
import type { Deposit, Fund, FxRow, Settings, Valuation } from './types';

// تحميل كل بيانات المحفظة — مشترك بين الصفحات
export function usePortfolioData() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [fx, setFx] = useState<FxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const [s, f, d, v, x] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('funds').select('*').order('name'),
      supabase.from('deposits').select('*').order('date', { ascending: true }),
      supabase
        .from('valuations')
        .select('*')
        .order('date', { ascending: true }),
      supabase
        .from('fx_history')
        .select('*')
        .order('date', { ascending: true }),
    ]);
    if (s.error || f.error || d.error || v.error || x.error) {
      setError(
        'حصل خطأ في تحميل البيانات — اتأكد إن الـ migration اتنفذ وإنك مسجّل دخول'
      );
    }
    setSettings((s.data as Settings) ?? null);
    setFunds((f.data as Fund[]) ?? []);
    setDeposits((d.data as Deposit[]) ?? []);
    setValuations((v.data as Valuation[]) ?? []);
    setFx((x.data as FxRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { settings, funds, deposits, valuations, fx, loading, error, reload };
}
