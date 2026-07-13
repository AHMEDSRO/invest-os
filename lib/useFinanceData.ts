'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from './supabase/client';
import type {
  DebtPayment,
  DebtRow,
  FxRow,
  MonthlyObligation,
  Person,
  Transaction,
} from './types';

// تحميل بيانات «الفلوس»: أشخاص + ديون + سدادات + حركات + التزامات ثابتة + سعر الصرف
export function useFinanceData() {
  const [people, setPeople] = useState<Person[]>([]);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [obligations, setObligations] = useState<MonthlyObligation[]>([]);
  const [fxRate, setFxRate] = useState(13);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const [p, d, pay, t, ob, fx] = await Promise.all([
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
        .from('monthly_obligations')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('fx_history')
        .select('*')
        .order('date', { ascending: false })
        .limit(1),
    ]);
    if (p.error || d.error || pay.error || t.error || ob.error) {
      setError(
        'حصل خطأ في تحميل البيانات — اتأكد إنك نفذت migration 006 في Supabase'
      );
    }
    setPeople((p.data as Person[]) ?? []);
    setDebts((d.data as DebtRow[]) ?? []);
    setPayments((pay.data as DebtPayment[]) ?? []);
    setTransactions((t.data as Transaction[]) ?? []);
    setObligations((ob.data as MonthlyObligation[]) ?? []);
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
    obligations,
    fxRate,
    loading,
    error,
    reload,
  };
}
