'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtMoney, fmtNum, todayISO } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import type {
  Currency,
  DebtDirection,
  DebtRow,
  MoneyCycle,
  Transaction,
} from '@/lib/types';
import { useFinanceData } from '@/lib/useFinanceData';
import { useLiveFx } from '@/lib/useLiveFx';

type Tab = 'CYCLE' | 'DEBTS' | 'OVERVIEW' | 'HISTORY';
type DebtFilter = 'ALL' | 'ON_ME' | 'TO_ME' | 'SETTLED';
type TxType = 'income' | 'expense';

const toAED = (amount: number, currency: string, rate: number) =>
  currency === 'EGP' ? amount / rate : amount;

const inputCls =
  'rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500';

type TxFormState = {
  id: string | null;
  date: string;
  amount: string;
  currency: Currency;
  category: string;
};
const emptyTxForm = (): TxFormState => ({
  id: null,
  date: todayISO(),
  amount: '',
  currency: 'EGP',
  category: '',
});

export default function MoneyPage() {
  const router = useRouter();
  const {
    people,
    debts,
    payments,
    transactions,
    cycles,
    fxRate,
    loading,
    error,
    reload,
  } = useFinanceData();

  // سعر AED/EGP حي — بيتحدث لوحده باستمرار، وبيرجع لآخر سعر مخزّن لو الإنترنت فصل
  const liveFxRate = useLiveFx(fxRate);
  const toEGP = (amount: number, currency: string) =>
    currency === 'AED' ? amount * liveFxRate : amount;

  const [tab, setTab] = useState<Tab>('CYCLE');
  const [filter, setFilter] = useState<DebtFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // رسالة خطأ عامة — بتتعرض بدل ما أي فورم يتصفّر بصمت لو الحفظ فشل
  const [actionError, setActionError] = useState<string | null>(null);
  const [printCycle, setPrintCycle] = useState<MoneyCycle | null>(null);
  const [cycleFilter, setCycleFilter] = useState<'ALL' | 'POS' | 'NEG'>('ALL');

  // فورمات الدخل والمصاريف (لكل نوع فورم مستقل + وضع تعديل)
  const [txForms, setTxForms] = useState<Record<TxType, TxFormState>>({
    income: emptyTxForm(),
    expense: emptyTxForm(),
  });

  // بدء دورة جديدة
  const [newCycleForm, setNewCycleForm] = useState({
    amount: '',
    currency: 'EGP' as Currency,
    note: '',
  });

  // سداد من الدورة الحالية: اختيار دين + مبلغ
  const [showPayInCycle, setShowPayInCycle] = useState(false);
  const [payTarget, setPayTarget] = useState<string>('');
  const [payTargetAmount, setPayTargetAmount] = useState<string>('');

  // إضافة/تعديل دين
  const [showAddDebt, setShowAddDebt] = useState(false);
  const emptyDebtForm = {
    personName: '',
    direction: 'on_me' as DebtDirection,
    title: '',
    principal: '',
    currency: 'EGP' as Currency,
    note: '',
  };
  const [debtForm, setDebtForm] = useState(emptyDebtForm);
  const [editingDebt, setEditingDebt] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    direction: 'on_me' as DebtDirection,
    title: '',
    principal: '',
    currency: 'EGP' as Currency,
    note: '',
  });

  // تعديل سداد
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [payEdit, setPayEdit] = useState({ date: '', amount: '', method: '' });

  // سداد من صفحة الديون
  const [payForm, setPayForm] = useState({
    date: todayISO(),
    amount: '',
    method: '',
  });

  const paidByDebt = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments)
      m.set(p.debt_id, (m.get(p.debt_id) || 0) + Number(p.amount));
    return m;
  }, [payments]);

  const lastPaymentByDebt = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of payments) {
      const prev = m.get(p.debt_id);
      if (!prev || p.date > prev) m.set(p.debt_id, p.date);
    }
    return m;
  }, [payments]);

  const personById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people]
  );
  const debtById = useMemo(() => new Map(debts.map((d) => [d.id, d])), [debts]);

  if (loading)
    return <p className="py-20 text-center text-zinc-500">جاري التحميل…</p>;
  if (error)
    return <p className="py-20 text-center text-red-400">{error}</p>;

  const remaining = (d: DebtRow) =>
    Math.max(0, Number(d.principal) - (paidByDebt.get(d.id) || 0));

  const openDebts = debts.filter((d) => d.status === 'open');
  const sumRemaining = (direction: DebtDirection, currency: Currency) =>
    openDebts
      .filter((d) => d.direction === direction && d.currency === currency)
      .reduce((s, d) => s + remaining(d), 0);

  const onMeEGP = sumRemaining('on_me', 'EGP');
  const onMeAED = sumRemaining('on_me', 'AED');
  const toMeEGP = sumRemaining('to_me', 'EGP');
  const toMeAED = sumRemaining('to_me', 'AED');
  const netAED =
    toAED(toMeEGP, 'EGP', liveFxRate) +
    toMeAED -
    (toAED(onMeEGP, 'EGP', liveFxRate) + onMeAED);

  // ===== الدورة =====
  const openCycle = cycles.find((c) => c.status === 'open') || null;
  const closedCycles = cycles.filter((c) => c.status === 'closed');

  function cycleRemainingEGP(cycle: MoneyCycle): number {
    const tx = transactions.filter((t) => t.cycle_id === cycle.id);
    const income = tx
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + toEGP(Number(t.amount), t.currency), 0);
    const expense = tx
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + toEGP(Number(t.amount), t.currency), 0);
    const paidOnMe = payments
      .filter(
        (p) =>
          p.cycle_id === cycle.id &&
          debtById.get(p.debt_id)?.direction === 'on_me'
      )
      .reduce((s, p) => {
        const d = debtById.get(p.debt_id);
        return s + toEGP(Number(p.amount), d?.currency || 'EGP');
      }, 0);
    const opening = toEGP(Number(cycle.opening_amount), cycle.opening_currency);
    return opening + income - expense - paidOnMe;
  }

  const cycleTx = openCycle
    ? transactions.filter((t) => t.cycle_id === openCycle.id)
    : [];
  const sumCycleTx = (type: TxType, currency: Currency) =>
    cycleTx
      .filter((t) => t.type === type && t.currency === currency)
      .reduce((s, t) => s + Number(t.amount), 0);
  const incomeEGP = sumCycleTx('income', 'EGP');
  const incomeAED = sumCycleTx('income', 'AED');
  const expenseEGP = sumCycleTx('expense', 'EGP');
  const expenseAED = sumCycleTx('expense', 'AED');

  const cyclePayments = openCycle
    ? payments.filter(
        (p) =>
          p.cycle_id === openCycle.id &&
          debtById.get(p.debt_id)?.direction === 'on_me'
      )
    : [];
  const debtPaidEGP = cyclePayments
    .filter((p) => debtById.get(p.debt_id)?.currency === 'EGP')
    .reduce((s, p) => s + Number(p.amount), 0);
  const debtPaidAED = cyclePayments
    .filter((p) => debtById.get(p.debt_id)?.currency === 'AED')
    .reduce((s, p) => s + Number(p.amount), 0);

  const remainingEGP = openCycle ? cycleRemainingEGP(openCycle) : 0;
  const remainingAED = remainingEGP / liveFxRate;

  // ===== أفعال =====

  async function startCycle(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(newCycleForm.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    setActionError(null);
    const { error } = await getSupabase().from('money_cycles').insert({
      opening_amount: amount,
      opening_currency: newCycleForm.currency,
      note: newCycleForm.note || null,
    });
    setSaving(false);
    if (error) {
      setActionError('حصل خطأ وإحنا بنبدأ الدورة — حاول تاني');
      return;
    }
    setNewCycleForm({ amount: '', currency: 'EGP', note: '' });
    reload();
  }

  async function closeCycle() {
    if (!openCycle) return;
    if (
      !window.confirm(
        'متأكد إنك عايز تقفل الدورة الحالية؟ هتتحفظ في السجل، وتقدر تبدأ دورة جديدة على طول بعدها.'
      )
    )
      return;
    setActionError(null);
    const { error } = await getSupabase()
      .from('money_cycles')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', openCycle.id);
    if (error) {
      setActionError('حصل خطأ وإحنا بنقفل الدورة — حاول تاني');
      return;
    }
    reload();
  }

  function investRemaining() {
    const amount = Math.round(Math.abs(remainingEGP));
    if (amount <= 0) return;
    router.push(`/?invest=${amount}&currency=EGP`);
  }

  // يجهّز ملخص PDF للدورة (عن طريق نافذة الطباعة) — تقدر تحفظه PDF من فيها
  function printCycleSummary(cycle: MoneyCycle) {
    setPrintCycle(cycle);
    setTimeout(() => window.print(), 100);
  }

  async function saveTx(type: TxType) {
    const f = txForms[type];
    const amount = parseFloat(f.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    setActionError(null);
    const supabase = getSupabase();
    const { error } = f.id
      ? await supabase
          .from('transactions')
          .update({
            date: f.date,
            category: f.category || null,
            amount,
            currency: f.currency,
          })
          .eq('id', f.id)
      : await supabase.from('transactions').insert({
          date: f.date,
          type,
          category: f.category || null,
          description: null,
          amount,
          currency: f.currency,
          cycle_id: openCycle?.id ?? null,
        });
    setSaving(false);
    if (error) {
      // ما نصفّرش الفورم لو الحفظ فشل — عشان المبلغ متختفيش من غير ما يتسجل
      setActionError('حصل خطأ في الحفظ — القيمة لسه في الخانة، جرب «أضف» تاني');
      return;
    }
    setTxForms((prev) => ({ ...prev, [type]: emptyTxForm() }));
    reload();
  }

  function editTx(t: Transaction) {
    setTxForms((prev) => ({
      ...prev,
      [t.type]: {
        id: t.id,
        date: t.date,
        amount: String(t.amount),
        currency: t.currency,
        category: t.category || '',
      },
    }));
    if (tab === 'HISTORY') setTab('CYCLE');
  }

  async function deleteTx(id: string) {
    if (!window.confirm('امسح الحركة دي؟')) return;
    await getSupabase().from('transactions').delete().eq('id', id);
    reload();
  }

  async function payDebt(debt: DebtRow, amountStr: string, method = '') {
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    setSaving(true);
    setActionError(null);
    const supabase = getSupabase();
    const { error } = await supabase.from('debt_payments').insert({
      debt_id: debt.id,
      date: todayISO(),
      amount,
      method: method || null,
      cycle_id: openCycle?.id ?? null,
    });
    if (error) {
      setSaving(false);
      setActionError('حصل خطأ في تسجيل السداد — جرب تاني');
      return;
    }
    if ((paidByDebt.get(debt.id) || 0) + amount >= Number(debt.principal)) {
      await supabase
        .from('debts')
        .update({ status: 'settled' })
        .eq('id', debt.id);
    }
    setSaving(false);
    setPayTarget('');
    setPayTargetAmount('');
    reload();
  }

  async function addPaymentDated(debt: DebtRow) {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    setActionError(null);
    const supabase = getSupabase();
    const { error } = await supabase.from('debt_payments').insert({
      debt_id: debt.id,
      date: payForm.date,
      amount,
      method: payForm.method || null,
      cycle_id: openCycle?.id ?? null,
    });
    if (error) {
      setSaving(false);
      setActionError('حصل خطأ في تسجيل السداد — جرب تاني');
      return;
    }
    if ((paidByDebt.get(debt.id) || 0) + amount >= Number(debt.principal)) {
      await supabase
        .from('debts')
        .update({ status: 'settled' })
        .eq('id', debt.id);
    }
    setSaving(false);
    setPayForm({ date: todayISO(), amount: '', method: '' });
    reload();
  }

  async function savePaymentEdit(id: string) {
    const amount = parseFloat(payEdit.amount);
    if (!amount || amount <= 0 || !payEdit.date) return;
    await getSupabase()
      .from('debt_payments')
      .update({
        date: payEdit.date,
        amount,
        method: payEdit.method || null,
      })
      .eq('id', id);
    setEditingPayment(null);
    reload();
  }

  async function deletePayment(id: string) {
    if (!window.confirm('امسح السداد ده؟')) return;
    await getSupabase().from('debt_payments').delete().eq('id', id);
    reload();
  }

  async function addDebt(e: React.FormEvent) {
    e.preventDefault();
    const principal = parseFloat(debtForm.principal);
    const name = debtForm.personName.trim();
    if (!name || !principal || principal <= 0) return;
    setSaving(true);
    const supabase = getSupabase();
    let personId = people.find((p) => p.name === name)?.id;
    if (!personId) {
      const { data } = await supabase
        .from('people')
        .insert({ name })
        .select('id')
        .single();
      personId = (data as { id: string } | null)?.id;
    }
    if (personId) {
      await supabase.from('debts').insert({
        person_id: personId,
        direction: debtForm.direction,
        title: debtForm.title || name,
        principal,
        currency: debtForm.currency,
        note: debtForm.note || null,
      });
    }
    setSaving(false);
    setShowAddDebt(false);
    setDebtForm(emptyDebtForm);
    reload();
  }

  function startEditDebt(d: DebtRow) {
    setEditingDebt(d.id);
    setEditForm({
      direction: d.direction,
      title: d.title || '',
      principal: String(d.principal),
      currency: d.currency,
      note: d.note || '',
    });
  }

  async function saveEditDebt(id: string) {
    const principal = parseFloat(editForm.principal);
    if (!principal || principal <= 0) return;
    setSaving(true);
    await getSupabase()
      .from('debts')
      .update({
        direction: editForm.direction,
        title: editForm.title || null,
        principal,
        currency: editForm.currency,
        note: editForm.note || null,
      })
      .eq('id', id);
    setSaving(false);
    setEditingDebt(null);
    reload();
  }

  async function flipDirection(d: DebtRow) {
    await getSupabase()
      .from('debts')
      .update({ direction: d.direction === 'on_me' ? 'to_me' : 'on_me' })
      .eq('id', d.id);
    reload();
  }

  async function toggleSettled(debt: DebtRow) {
    await getSupabase()
      .from('debts')
      .update({ status: debt.status === 'open' ? 'settled' : 'open' })
      .eq('id', debt.id);
    reload();
  }

  async function deleteDebt(debt: DebtRow) {
    if (
      !window.confirm(
        `متأكد إنك عايز تمسح «${debt.title}» بكل سداداته نهائيًا؟`
      )
    )
      return;
    await getSupabase().from('debts').delete().eq('id', debt.id);
    reload();
  }

  // ===== مكوّن عمود دخل/مصروف — يُستخدم جنب بعض في نفس السكشن =====
  function txColumn(type: TxType) {
    const f = txForms[type];
    const list = cycleTx
      .filter((t) => t.type === type)
      .sort((a, b) => b.date.localeCompare(a.date));
    const isIncome = type === 'income';
    return (
      <div
        className={`rounded-xl border p-3 md:p-4 ${
          isIncome
            ? 'border-emerald-900/50 bg-emerald-950/10'
            : 'border-red-900/50 bg-red-950/10'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3
            className={`text-sm font-bold ${isIncome ? 'text-emerald-300' : 'text-red-300'}`}
          >
            {isIncome ? 'الدخل 🔺' : 'المصاريف 🔻'}
          </h3>
          <p className="num text-xs font-bold text-zinc-300">
            {fmtNum(isIncome ? incomeEGP : expenseEGP)} EGP
            <span className="mx-1 text-zinc-600">+</span>
            {fmtNum(isIncome ? incomeAED : expenseAED)} AED
          </p>
        </div>

        {/* فورم إضافة/تعديل — حقل تحت حقل عشان يبقى أسهل في الإدخال */}
        <div className="mb-3 space-y-2 rounded-lg bg-zinc-950/50 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">
                المبلغ
              </label>
              <input
                type="number"
                step="any"
                dir="ltr"
                value={f.amount}
                onChange={(e) =>
                  setTxForms((p) => ({
                    ...p,
                    [type]: { ...f, amount: e.target.value },
                  }))
                }
                placeholder="0"
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">
                العملة
              </label>
              <select
                value={f.currency}
                onChange={(e) =>
                  setTxForms((p) => ({
                    ...p,
                    [type]: { ...f, currency: e.target.value as Currency },
                  }))
                }
                className={`${inputCls} w-full`}
              >
                <option value="EGP">جنيه</option>
                <option value="AED">درهم</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-zinc-500">
              {isIncome ? 'المصدر' : 'البند'}
            </label>
            <input
              value={f.category}
              onChange={(e) =>
                setTxForms((p) => ({
                  ...p,
                  [type]: { ...f, category: e.target.value },
                }))
              }
              placeholder={isIncome ? 'مثلًا: مرتب' : 'مثلًا: إيجار'}
              className={`${inputCls} w-full`}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-zinc-500">
                التاريخ
              </label>
              <input
                type="date"
                dir="ltr"
                value={f.date}
                onChange={(e) =>
                  setTxForms((p) => ({
                    ...p,
                    [type]: { ...f, date: e.target.value },
                  }))
                }
                className={`${inputCls} w-full`}
              />
            </div>
            <button
              onClick={() => saveTx(type)}
              disabled={saving || !parseFloat(f.amount)}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-40 ${
                isIncome
                  ? 'bg-emerald-500 hover:bg-emerald-400'
                  : 'bg-red-400 hover:bg-red-300'
              }`}
            >
              {f.id ? 'حفظ' : '+ أضف'}
            </button>
            {f.id && (
              <button
                onClick={() =>
                  setTxForms((p) => ({ ...p, [type]: emptyTxForm() }))
                }
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400"
              >
                إلغاء
              </button>
            )}
          </div>
        </div>

        {/* قائمة الدورة */}
        {list.length === 0 ? (
          <p className="text-xs text-zinc-600">لسه مسجلتش حاجة في الدورة دي</p>
        ) : (
          <ul className="space-y-2">
            {list.map((t) => (
              <li
                key={t.id}
                className="rounded-xl bg-zinc-950/60 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {t.category || (isIncome ? 'دخل' : 'مصروف')}
                    </p>
                    <p className="num text-xs text-zinc-600">{t.date}</p>
                  </div>
                  <p
                    className={`num text-2xl font-black ${isIncome ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {fmtMoney(Number(t.amount), t.currency)}
                  </p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => editTx(t)}
                    className="flex-1 rounded-lg border border-zinc-700 py-1.5 text-xs font-bold text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    onClick={() => deleteTx(t.id)}
                    className="flex-1 rounded-lg border border-zinc-800 py-1.5 text-xs font-bold text-zinc-500 hover:border-red-600 hover:text-red-400"
                  >
                    🗑 حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // فلترة دفتر الديون
  const visibleDebts = debts
    .filter((d) => {
      if (filter === 'ON_ME')
        return d.direction === 'on_me' && d.status === 'open';
      if (filter === 'TO_ME')
        return d.direction === 'to_me' && d.status === 'open';
      if (filter === 'SETTLED') return d.status === 'settled';
      return d.status === 'open';
    })
    .filter((d) => {
      if (!search.trim()) return true;
      const person = personById.get(d.person_id)?.name || '';
      return (
        person.includes(search.trim()) ||
        (d.title || '').includes(search.trim())
      );
    })
    .sort((a, b) => {
      const pa = personById.get(a.person_id)?.name || '';
      const pb = personById.get(b.person_id)?.name || '';
      return pa.localeCompare(pb, 'ar') || remaining(b) - remaining(a);
    });

  const onMeOpenDebts = openDebts
    .filter((d) => d.direction === 'on_me')
    .sort((a, b) => remaining(b) - remaining(a));
  const selectedDebt = debts.find((d) => d.id === payTarget) || null;

  async function paySelectedDebt() {
    if (!selectedDebt) return;
    await payDebt(selectedDebt, payTargetAmount);
    setShowPayInCycle(false);
  }

  const filterChips: [DebtFilter, string][] = [
    ['ALL', 'الكل المفتوح'],
    ['ON_ME', '🔻 عليّا'],
    ['TO_ME', '🔺 ليّا'],
    ['SETTLED', '✓ المقفول'],
  ];

  return (
    <>
    <div className="space-y-5 print:hidden">
      <h1 className="text-xl font-bold">الفلوس</h1>

      {actionError && (
        <div className="flex items-center justify-between rounded-xl border border-red-700/60 bg-red-950/40 px-4 py-2.5 text-sm text-red-200">
          <span>⚠️ {actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-300 hover:text-red-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5 md:gap-2">
        {(
          [
            ['CYCLE', '💵 الدورة الحالية'],
            ['DEBTS', '🤝 الديون'],
            ['OVERVIEW', '📊 نظرة عامة'],
            ['HISTORY', '🗂 كل الحركات'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-bold transition-all sm:px-4 sm:py-2.5 sm:text-sm ${
              tab === key
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ============ الدورة الحالية ============ */}
      {tab === 'CYCLE' && (
        <div className="space-y-4">
          {!openCycle ? (
            /* مفيش دورة مفتوحة — ابدأ واحدة جديدة */
            <div className="rounded-2xl border border-amber-600/40 bg-gradient-to-l from-zinc-900 to-amber-950/20 p-4 md:p-5">
              <h2 className="mb-1 text-sm font-bold text-amber-300">
                معايا كام دلوقتي؟
              </h2>
              <p className="mb-4 text-xs text-zinc-500">
                ده بداية دورة كاش جديدة — سجّل فيها دخلك ومصاريفك وسداداتك،
                واقفلها وقت ما تحب
              </p>
              <form
                onSubmit={startCycle}
                className="flex flex-wrap items-end gap-2"
              >
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    المبلغ
                  </label>
                  <input
                    type="number"
                    step="any"
                    dir="ltr"
                    value={newCycleForm.amount}
                    onChange={(e) =>
                      setNewCycleForm({
                        ...newCycleForm,
                        amount: e.target.value,
                      })
                    }
                    placeholder="مثلًا 9000"
                    className={`${inputCls} w-32`}
                  />
                </div>
                <select
                  value={newCycleForm.currency}
                  onChange={(e) =>
                    setNewCycleForm({
                      ...newCycleForm,
                      currency: e.target.value as Currency,
                    })
                  }
                  className={inputCls}
                >
                  <option value="EGP">جنيه EGP</option>
                  <option value="AED">درهم AED</option>
                </select>
                <input
                  value={newCycleForm.note}
                  onChange={(e) =>
                    setNewCycleForm({
                      ...newCycleForm,
                      note: e.target.value,
                    })
                  }
                  placeholder="ملاحظة (اختياري)"
                  className={`${inputCls} flex-1 basis-32`}
                />
                <button
                  type="submit"
                  disabled={saving || !parseFloat(newCycleForm.amount)}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
                >
                  ابدأ الدورة
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* رأس الدورة + المتبقي بارز فوق — تشوفه من غير سكرول */}
              <div className="rounded-2xl border border-amber-600/40 bg-gradient-to-l from-zinc-900 via-zinc-900 to-amber-950/30 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-zinc-400">
                      الدورة الحالية — بدأت بـ{' '}
                      <span className="num font-bold text-amber-300">
                        {fmtNum(Number(openCycle.opening_amount))}{' '}
                        {openCycle.opening_currency}
                      </span>{' '}
                      يوم{' '}
                      <span className="num">
                        {openCycle.started_at.slice(0, 10)}
                      </span>
                    </p>
                    {openCycle.note && (
                      <p className="mt-1 text-xs text-zinc-500">
                        📝 {openCycle.note}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => printCycleSummary(openCycle)}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                    >
                      🖨 ملخص PDF
                    </button>
                    <button
                      onClick={closeCycle}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:border-red-600 hover:text-red-400"
                    >
                      🔒 اقفل الدورة
                    </button>
                  </div>
                </div>

                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <p className="text-xs text-amber-300/80">المتبقي معاك</p>
                  <p
                    className={`num mt-1 text-4xl font-black ${
                      remainingEGP >= 0 ? 'text-amber-300' : 'text-red-400'
                    }`}
                  >
                    {fmtNum(remainingEGP)} EGP
                  </p>
                  <p className="num mt-0.5 text-xs text-zinc-500">
                    ≈ {fmtNum(remainingAED)} AED — سعر اليوم:{' '}
                    {fmtNum(liveFxRate, 2)} EGP لكل 1 AED
                  </p>
                  <p className="num mt-2 text-xs leading-6 text-zinc-500">
                    بدأت بـ{' '}
                    {fmtNum(
                      toEGP(
                        Number(openCycle.opening_amount),
                        openCycle.opening_currency
                      )
                    )}{' '}
                    + دخلت {fmtNum(incomeEGP + incomeAED * liveFxRate)} −
                    صرفت {fmtNum(expenseEGP + expenseAED * liveFxRate)}
                    {(debtPaidEGP > 0 || debtPaidAED > 0) && (
                      <>
                        {' '}
                        − سددت{' '}
                        {fmtNum(debtPaidEGP + debtPaidAED * liveFxRate)}
                      </>
                    )}{' '}
                    (بالجنيه)
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowPayInCycle(!showPayInCycle)}
                      disabled={onMeOpenDebts.length === 0}
                      className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                    >
                      🤝 سدّد دين من الباقي
                    </button>
                    <button
                      onClick={investRemaining}
                      disabled={remainingEGP <= 0}
                      className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
                    >
                      📈 استثمر الباقي
                    </button>
                  </div>
                </div>

                {showPayInCycle && (
                  <div className="mt-4 rounded-xl bg-zinc-950/70 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1">
                        <label className="mb-1 block text-xs text-zinc-400">
                          اختار الشخص
                        </label>
                        <select
                          value={payTarget}
                          onChange={(e) => {
                            setPayTarget(e.target.value);
                            setPayTargetAmount('');
                          }}
                          className={`${inputCls} w-full`}
                        >
                          <option value="">— اختار من ديونك المفتوحة —</option>
                          {onMeOpenDebts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {personById.get(d.person_id)?.name} — باقي{' '}
                              {fmtNum(remaining(d))} {d.currency}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedDebt && (
                        <>
                          <div>
                            <label className="mb-1 block text-xs text-zinc-400">
                              هتسدد كام
                            </label>
                            <input
                              type="number"
                              step="any"
                              dir="ltr"
                              value={payTargetAmount}
                              onChange={(e) =>
                                setPayTargetAmount(e.target.value)
                              }
                              placeholder={selectedDebt.currency}
                              className={`${inputCls} w-28`}
                            />
                          </div>
                          <button
                            onClick={paySelectedDebt}
                            disabled={saving || !parseFloat(payTargetAmount)}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-30"
                          >
                            سدّد ✓
                          </button>
                        </>
                      )}
                    </div>
                    {selectedDebt && (
                      <p className="num mt-2 text-xs text-zinc-400">
                        باقي على «
                        {personById.get(selectedDebt.person_id)?.name}»:{' '}
                        <span className="font-bold text-red-300">
                          {fmtMoney(
                            remaining(selectedDebt),
                            selectedDebt.currency
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* تسجيل الدخل والمصاريف — تحت، بعد ما شفت المتبقي */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5">
                <h2 className="mb-3 text-sm font-bold text-zinc-200">
                  سجّل دخلك ومصاريفك في الدورة دي
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {txColumn('income')}
                  {txColumn('expense')}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ الديون (دفتر الحسابات) ============ */}
      {tab === 'DEBTS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {filterChips.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  filter === key
                    ? 'bg-amber-500 text-zinc-950'
                    : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 دوّر بالاسم…"
              className={`${inputCls} mr-auto w-40 py-1.5 text-xs`}
            />
            <button
              onClick={() => setShowAddDebt(!showAddDebt)}
              className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-zinc-950 hover:bg-amber-400"
            >
              {showAddDebt ? 'إغلاق' : '+ دين جديد'}
            </button>
          </div>

          {showAddDebt && (
            <form
              onSubmit={addDebt}
              className="grid gap-3 rounded-2xl border border-amber-600/40 bg-zinc-900 p-4 md:grid-cols-3"
            >
              <input
                list="people-list"
                value={debtForm.personName}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, personName: e.target.value })
                }
                placeholder="اسم الشخص/الجهة"
                required
                className={inputCls}
              />
              <datalist id="people-list">
                {people.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
              <select
                value={debtForm.direction}
                onChange={(e) =>
                  setDebtForm({
                    ...debtForm,
                    direction: e.target.value as DebtDirection,
                  })
                }
                className={inputCls}
              >
                <option value="on_me">🔻 عليّا (أنا المدين)</option>
                <option value="to_me">🔺 ليّا (هو المدين)</option>
              </select>
              <input
                value={debtForm.title}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, title: e.target.value })
                }
                placeholder="وصف الدين (اختياري)"
                className={inputCls}
              />
              <input
                type="number"
                step="any"
                dir="ltr"
                value={debtForm.principal}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, principal: e.target.value })
                }
                placeholder="المبلغ"
                required
                className={inputCls}
              />
              <select
                value={debtForm.currency}
                onChange={(e) =>
                  setDebtForm({
                    ...debtForm,
                    currency: e.target.value as Currency,
                  })
                }
                className={inputCls}
              >
                <option value="EGP">جنيه EGP</option>
                <option value="AED">درهم AED</option>
              </select>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                إضافة
              </button>
            </form>
          )}

          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-right text-xs text-zinc-500">
                  <th className="p-3">الشخص</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">الأصل</th>
                  <th className="p-3">اتسدد</th>
                  <th className="p-3">الباقي</th>
                  <th className="p-3">آخر سداد</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {visibleDebts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-600">
                      مفيش نتايج بالفلتر ده
                    </td>
                  </tr>
                )}
                {visibleDebts.map((d) => {
                  const paid = paidByDebt.get(d.id) || 0;
                  const rem = remaining(d);
                  const isExpanded = expandedDebt === d.id;
                  const isEditing = editingDebt === d.id;
                  const debtPayments = payments
                    .filter((p) => p.debt_id === d.id)
                    .sort((a, b) => b.date.localeCompare(a.date));
                  return (
                    <>
                      <tr
                        key={d.id}
                        onClick={() =>
                          setExpandedDebt(isExpanded ? null : d.id)
                        }
                        className={`cursor-pointer border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40 ${
                          isExpanded ? 'bg-zinc-800/40' : ''
                        }`}
                      >
                        <td className="p-3">
                          <p className="font-bold text-zinc-100">
                            {personById.get(d.person_id)?.name}
                          </p>
                          <p className="text-xs text-zinc-500">{d.title}</p>
                        </td>
                        <td className="p-3">
                          {d.status === 'settled' ? (
                            <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-bold text-zinc-400">
                              ✓ مقفول
                            </span>
                          ) : d.direction === 'on_me' ? (
                            <span className="rounded-full bg-red-950 px-2.5 py-1 text-[11px] font-bold text-red-300">
                              🔻 عليك
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-950 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                              🔺 ليك
                            </span>
                          )}
                        </td>
                        <td className="num p-3 text-zinc-300">
                          {fmtMoney(Number(d.principal), d.currency)}
                        </td>
                        <td className="num p-3 text-zinc-400">
                          {fmtNum(paid)}
                        </td>
                        <td
                          className={`num p-3 text-base font-black ${
                            d.status === 'settled'
                              ? 'text-zinc-500'
                              : d.direction === 'on_me'
                                ? 'text-red-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          {fmtMoney(rem, d.currency)}
                        </td>
                        <td className="num p-3 text-xs text-zinc-500">
                          {lastPaymentByDebt.get(d.id) || '—'}
                        </td>
                        <td className="p-3 text-xs text-zinc-600">
                          {isExpanded ? '▲' : '▼'}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b border-zinc-800/60 bg-zinc-950/60">
                          <td colSpan={7} className="p-4">
                            {d.note && (
                              <p className="mb-3 rounded-lg bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                                📝 {d.note}
                              </p>
                            )}

                            {isEditing ? (
                              <div className="mb-4 grid gap-2 rounded-xl border border-amber-600/40 bg-zinc-900 p-3 md:grid-cols-5">
                                <select
                                  value={editForm.direction}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      direction: e.target
                                        .value as DebtDirection,
                                    })
                                  }
                                  className={inputCls}
                                >
                                  <option value="on_me">
                                    🔻 عليّا (أنا المدين)
                                  </option>
                                  <option value="to_me">
                                    🔺 ليّا (هو المدين)
                                  </option>
                                </select>
                                <input
                                  value={editForm.title}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      title: e.target.value,
                                    })
                                  }
                                  placeholder="الوصف"
                                  className={inputCls}
                                />
                                <input
                                  type="number"
                                  step="any"
                                  dir="ltr"
                                  value={editForm.principal}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      principal: e.target.value,
                                    })
                                  }
                                  className={inputCls}
                                />
                                <select
                                  value={editForm.currency}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      currency: e.target.value as Currency,
                                    })
                                  }
                                  className={inputCls}
                                >
                                  <option value="EGP">جنيه</option>
                                  <option value="AED">درهم</option>
                                </select>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveEditDebt(d.id)}
                                    disabled={saving}
                                    className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-50"
                                  >
                                    حفظ
                                  </button>
                                  <button
                                    onClick={() => setEditingDebt(null)}
                                    className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mb-4 flex flex-wrap gap-2">
                                <button
                                  onClick={() => flipDirection(d)}
                                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                                >
                                  🔄 اعكس الاتجاه (
                                  {d.direction === 'on_me'
                                    ? 'خليه ليّا'
                                    : 'خليه عليّا'}
                                  )
                                </button>
                                <button
                                  onClick={() => startEditDebt(d)}
                                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                                >
                                  ✏️ تعديل
                                </button>
                                <button
                                  onClick={() => toggleSettled(d)}
                                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300"
                                >
                                  {d.status === 'open'
                                    ? '✓ اقفله (اتسدد)'
                                    : '↩ افتحه تاني'}
                                </button>
                                <button
                                  onClick={() => deleteDebt(d)}
                                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 hover:border-red-600 hover:text-red-400"
                                >
                                  🗑 حذف نهائي
                                </button>
                              </div>
                            )}

                            {d.status === 'open' && (
                              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900 p-3">
                                <span className="text-xs font-bold text-zinc-400">
                                  سداد جديد:
                                </span>
                                <input
                                  type="date"
                                  dir="ltr"
                                  value={payForm.date}
                                  onChange={(e) =>
                                    setPayForm({
                                      ...payForm,
                                      date: e.target.value,
                                    })
                                  }
                                  className={`${inputCls} text-xs`}
                                />
                                <input
                                  type="number"
                                  step="any"
                                  dir="ltr"
                                  value={payForm.amount}
                                  onChange={(e) =>
                                    setPayForm({
                                      ...payForm,
                                      amount: e.target.value,
                                    })
                                  }
                                  placeholder="المبلغ"
                                  className={`${inputCls} w-28 text-xs`}
                                />
                                <input
                                  value={payForm.method}
                                  onChange={(e) =>
                                    setPayForm({
                                      ...payForm,
                                      method: e.target.value,
                                    })
                                  }
                                  placeholder="الطريقة"
                                  className={`${inputCls} w-36 text-xs`}
                                />
                                <button
                                  onClick={() => addPaymentDated(d)}
                                  disabled={
                                    saving || !parseFloat(payForm.amount)
                                  }
                                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                                >
                                  سجّل ✓
                                </button>
                              </div>
                            )}

                            {debtPayments.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-right text-zinc-600">
                                    <th className="py-1.5">التاريخ</th>
                                    <th className="py-1.5">المبلغ</th>
                                    <th className="py-1.5">الطريقة</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {debtPayments.map((p) =>
                                    editingPayment === p.id ? (
                                      <tr
                                        key={p.id}
                                        className="border-t border-zinc-800/50 bg-zinc-900"
                                      >
                                        <td className="py-1.5">
                                          <input
                                            type="date"
                                            dir="ltr"
                                            value={payEdit.date}
                                            onChange={(e) =>
                                              setPayEdit({
                                                ...payEdit,
                                                date: e.target.value,
                                              })
                                            }
                                            className={`${inputCls} py-1 text-xs`}
                                          />
                                        </td>
                                        <td className="py-1.5">
                                          <input
                                            type="number"
                                            step="any"
                                            dir="ltr"
                                            value={payEdit.amount}
                                            onChange={(e) =>
                                              setPayEdit({
                                                ...payEdit,
                                                amount: e.target.value,
                                              })
                                            }
                                            className={`${inputCls} w-24 py-1 text-xs`}
                                          />
                                        </td>
                                        <td className="py-1.5">
                                          <input
                                            value={payEdit.method}
                                            onChange={(e) =>
                                              setPayEdit({
                                                ...payEdit,
                                                method: e.target.value,
                                              })
                                            }
                                            className={`${inputCls} w-32 py-1 text-xs`}
                                          />
                                        </td>
                                        <td className="py-1.5 text-left">
                                          <button
                                            onClick={() =>
                                              savePaymentEdit(p.id)
                                            }
                                            className="ml-2 font-bold text-emerald-400"
                                          >
                                            حفظ
                                          </button>
                                          <button
                                            onClick={() =>
                                              setEditingPayment(null)
                                            }
                                            className="text-zinc-500"
                                          >
                                            إلغاء
                                          </button>
                                        </td>
                                      </tr>
                                    ) : (
                                      <tr
                                        key={p.id}
                                        className="border-t border-zinc-800/50"
                                      >
                                        <td className="num py-1.5">
                                          {p.date}
                                        </td>
                                        <td className="num py-1.5 font-bold text-zinc-200">
                                          {fmtNum(Number(p.amount))}
                                        </td>
                                        <td className="py-1.5 text-zinc-400">
                                          {p.method || p.note || '—'}
                                        </td>
                                        <td className="py-1.5 text-left">
                                          <button
                                            onClick={() => {
                                              setEditingPayment(p.id);
                                              setPayEdit({
                                                date: p.date,
                                                amount: String(p.amount),
                                                method: p.method || '',
                                              });
                                            }}
                                            className="ml-2 text-zinc-600 hover:text-amber-300"
                                          >
                                            ✏️
                                          </button>
                                          <button
                                            onClick={() =>
                                              deletePayment(p.id)
                                            }
                                            className="text-zinc-600 hover:text-red-400"
                                          >
                                            ✕
                                          </button>
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-xs text-zinc-600">
                                لسه مفيش سدادات مسجلة
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ نظرة عامة ============ */}
      {tab === 'OVERVIEW' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-4">
              <p className="text-xs text-red-300/80">🔻 عليك (مفتوح)</p>
              <p className="num mt-1 text-lg font-bold text-red-300">
                {fmtNum(onMeEGP)} EGP
              </p>
              <p className="num text-sm text-red-300/70">
                + {fmtNum(onMeAED)} AED
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
              <p className="text-xs text-emerald-300/80">🔺 ليك عند الناس</p>
              <p className="num mt-1 text-lg font-bold text-emerald-300">
                {fmtNum(toMeEGP)} EGP
              </p>
              <p className="num text-sm text-emerald-300/70">
                + {fmtNum(toMeAED)} AED
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs text-zinc-400">صافي الديون (بالدرهم)</p>
              <p
                className={`num mt-1 text-lg font-bold ${netAED >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {fmtNum(netAED)} AED
              </p>
              <p className="text-xs text-zinc-600">اللي ليك ناقص اللي عليك</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs text-zinc-400">المتبقي في دورتك الحالية</p>
              <p
                className={`num mt-1 text-lg font-bold ${
                  !openCycle
                    ? 'text-zinc-500'
                    : remainingEGP >= 0
                      ? 'text-emerald-300'
                      : 'text-red-300'
                }`}
              >
                {openCycle ? `${fmtNum(remainingEGP)} EGP` : 'مفيش دورة مفتوحة'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="mb-3 text-sm font-bold text-red-300">
                🔻 أكبر الديون عليك
              </h2>
              <ul className="space-y-2">
                {openDebts
                  .filter((d) => d.direction === 'on_me')
                  .sort((a, b) => remaining(b) - remaining(a))
                  .slice(0, 5)
                  .map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-zinc-300">
                        {personById.get(d.person_id)?.name}
                      </span>
                      <span className="num font-bold text-red-300">
                        {fmtMoney(remaining(d), d.currency)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="mb-3 text-sm font-bold text-emerald-300">
                🔺 أكبر المستحقات ليك
              </h2>
              <ul className="space-y-2">
                {openDebts
                  .filter((d) => d.direction === 'to_me')
                  .sort((a, b) => remaining(b) - remaining(a))
                  .slice(0, 5)
                  .map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-zinc-300">
                        {personById.get(d.person_id)?.name} — {d.title}
                      </span>
                      <span className="num font-bold text-emerald-300">
                        {fmtMoney(remaining(d), d.currency)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          {/* دورات سابقة */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-zinc-300">
                🗂 دورات سابقة (مقفولة)
              </h2>
              <div className="flex gap-1.5">
                {(
                  [
                    ['ALL', 'الكل'],
                    ['POS', '🟢 بربح'],
                    ['NEG', '🔴 بخسارة'],
                  ] as [typeof cycleFilter, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCycleFilter(key)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                      cycleFilter === key
                        ? 'bg-amber-500 text-zinc-950'
                        : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {closedCycles.length === 0 ? (
              <p className="text-sm text-zinc-600">لسه مفيش دورة اتقفلت</p>
            ) : (
              <ul className="space-y-2">
                {closedCycles
                  .filter((c) => {
                    if (cycleFilter === 'ALL') return true;
                    const rem = cycleRemainingEGP(c);
                    return cycleFilter === 'POS' ? rem >= 0 : rem < 0;
                  })
                  .map((c) => {
                    const rem = cycleRemainingEGP(c);
                    return (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950/60 px-3 py-2 text-sm"
                      >
                        <span className="text-zinc-300">
                          بدأت بـ{' '}
                          <span className="num">
                            {fmtNum(Number(c.opening_amount))}{' '}
                            {c.opening_currency}
                          </span>{' '}
                          <span className="num text-xs text-zinc-500">
                            ({c.started_at.slice(0, 10)} →{' '}
                            {c.closed_at?.slice(0, 10)})
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span
                            className={`num font-bold ${rem >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                          >
                            اتقفلت على {fmtNum(rem)} EGP
                          </span>
                          <button
                            onClick={() => printCycleSummary(c)}
                            title="نزّل ملخص PDF"
                            className="text-zinc-500 hover:text-amber-300"
                          >
                            🖨
                          </button>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ============ كل الحركات ============ */}
      {tab === 'HISTORY' && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-right text-xs text-zinc-500">
                <th className="p-3">التاريخ</th>
                <th className="p-3">النوع</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">التصنيف</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-600">
                    لسه مفيش حركات مسجلة
                  </td>
                </tr>
              )}
              {transactions.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-zinc-800/60 last:border-0"
                >
                  <td className="num p-3">{t.date}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        t.type === 'income'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-red-950 text-red-300'
                      }`}
                    >
                      {t.type === 'income' ? '🔺 دخل' : '🔻 مصروف'}
                    </span>
                  </td>
                  <td
                    className={`num p-3 font-bold ${
                      t.type === 'income' ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {fmtMoney(Number(t.amount), t.currency)}
                  </td>
                  <td className="p-3 text-zinc-400">
                    {t.category || t.description || '—'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => editTx(t)}
                      className="ml-2 text-zinc-600 hover:text-amber-300"
                      title="تعديل (هيفتح في الدورة الحالية)"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteTx(t.id)}
                      className="text-zinc-600 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* ============ ملخص الطباعة/PDF — مخفي على الشاشة، بيظهر بس وقت الطباعة ============ */}
    {printCycle && (
      <div className="hidden bg-white p-8 text-black print:block">
        {(() => {
          const tx = transactions
            .filter((t) => t.cycle_id === printCycle.id)
            .sort((a, b) => a.date.localeCompare(b.date));
          const pays = payments
            .filter((p) => p.cycle_id === printCycle.id)
            .sort((a, b) => a.date.localeCompare(b.date));
          const rem = cycleRemainingEGP(printCycle);
          return (
            <>
              <h1 className="mb-1 text-xl font-bold">ملخص دورة كاش — Invest-OS</h1>
              <p className="num mb-4 text-sm text-zinc-700">
                من {printCycle.started_at.slice(0, 10)}
                {printCycle.closed_at
                  ? ` إلى ${printCycle.closed_at.slice(0, 10)}`
                  : ' (لسه مفتوحة)'}
                {' — '}
                بدأت بـ {fmtNum(Number(printCycle.opening_amount))}{' '}
                {printCycle.opening_currency}
              </p>

              <h2 className="mb-2 mt-4 text-sm font-bold">حركات الدخل والمصاريف</h2>
              {tx.length === 0 ? (
                <p className="text-xs text-zinc-600">لا توجد حركات</p>
              ) : (
                <table className="num w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-black text-right">
                      <th className="py-1">التاريخ</th>
                      <th className="py-1">النوع</th>
                      <th className="py-1">البند</th>
                      <th className="py-1">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.map((t) => (
                      <tr key={t.id} className="border-b border-zinc-300">
                        <td className="py-1">{t.date}</td>
                        <td className="py-1">
                          {t.type === 'income' ? 'دخل' : 'مصروف'}
                        </td>
                        <td className="py-1">{t.category || '—'}</td>
                        <td className="py-1">
                          {fmtMoney(Number(t.amount), t.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h2 className="mb-2 mt-4 text-sm font-bold">سدادات ديون في الدورة</h2>
              {pays.length === 0 ? (
                <p className="text-xs text-zinc-600">لا توجد سدادات</p>
              ) : (
                <table className="num w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-black text-right">
                      <th className="py-1">التاريخ</th>
                      <th className="py-1">لمين</th>
                      <th className="py-1">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pays.map((p) => {
                      const d = debtById.get(p.debt_id);
                      return (
                        <tr key={p.id} className="border-b border-zinc-300">
                          <td className="py-1">{p.date}</td>
                          <td className="py-1">
                            {d ? personById.get(d.person_id)?.name : '—'}
                          </td>
                          <td className="py-1">
                            {fmtMoney(Number(p.amount), d?.currency || 'EGP')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <p className="num mt-6 text-lg font-bold">
                المتبقي: {fmtNum(rem)} EGP
              </p>
            </>
          );
        })()}
      </div>
    )}
  </>
  );
}
