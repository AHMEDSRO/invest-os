'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from './supabase/client';
import type {
  DebtPayment,
  DebtRow,
  FxRow,
  Person,
  Transaction,
} from './types';

// تحميل بيانات «الفلوس»: أشخاص + ديون + سدادات + حركات + سعر الصرف
export function useFinanceData() {
  const [people, setPeople] = useState<Person[]>([]);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fxRate, setFxRate] = useState(13);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const [p, d, pay, t, fx] = await Promise.all([
      supabase.from('people').select('*').order('name'),
      supabase.from('debts').select('*').order('created_at'),
      supabase
        .from('debt_payments')
        .select('*')
        .order('date', { ascending: true }),
      supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false }),
      supabase
        .from('fx_history')
        .select('*')
        .order('date', { ascending: false })
        .limit(1),
    ]);
    if (p.error || d.error || pay.error || t.error) {
      setError(
        'حصل خطأ في تحميل البيانات — اتأكد إنك نفذت migration 003 في Supabase'
      );
    }
    setPeople((p.data as Person[]) ?? []);
    setDebts((d.data as DebtRow[]) ?? []);
    setPayments((pay.data as DebtPayment[]) ?? []);
    setTransactions((t.data as Transaction[]) ?? []);
    const fxRow = (fx.data as FxRow[])?.[0];
    if (fxRow) setFxRate(Number(fxRow.aed_egp));
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    people,
    debts,
    payments,
    transactions,
    fxRate,
    loading,
    error,
    reload,
  };
}
