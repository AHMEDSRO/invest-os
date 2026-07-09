'use client';

import { useMemo, useState } from 'react';
import { fmtMoney, fmtNum, todayISO } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import type { Currency, DebtDirection, DebtRow } from '@/lib/types';
import { useFinanceData } from '@/lib/useFinanceData';

type Tab = 'OVERVIEW' | 'DEBTS' | 'TRANSACTIONS';
type DebtFilter = 'ALL' | 'ON_ME' | 'TO_ME' | 'SETTLED';

const toAED = (amount: number, currency: string, rate: number) =>
  currency === 'EGP' ? amount / rate : amount;

const inputCls =
  'rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500';

export default function MoneyPage() {
  const {
    people,
    debts,
    payments,
    transactions,
    fxRate,
    loading,
    error,
    reload,
  } = useFinanceData();

  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [filter, setFilter] = useState<DebtFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // فورم إضافة دين جديد
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

  // فورم تعديل دين موجود
  const [editingDebt, setEditingDebt] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    direction: 'on_me' as DebtDirection,
    title: '',
    principal: '',
    currency: 'EGP' as Currency,
    note: '',
  });

  // فورم سداد
  const [payForm, setPayForm] = useState({
    date: todayISO(),
    amount: '',
    method: '',
  });

  // فورم حركة
  const [txForm, setTxForm] = useState({
    date: todayISO(),
    type: 'expense' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
    currency: 'EGP' as Currency,
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
    toAED(toMeEGP, 'EGP', fxRate) +
    toMeAED -
    (toAED(onMeEGP, 'EGP', fxRate) + onMeAED);

  const monthKey = todayISO().slice(0, 7);
  const monthTx = transactions.filter((t) => t.date.startsWith(monthKey));
  const monthIncomeAED = monthTx
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + toAED(Number(t.amount), t.currency, fxRate), 0);
  const monthExpenseAED = monthTx
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + toAED(Number(t.amount), t.currency, fxRate), 0);

  // فلترة جدول الديون
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

  async function addPayment(debt: DebtRow) {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    const supabase = getSupabase();
    await supabase.from('debt_payments').insert({
      debt_id: debt.id,
      date: payForm.date,
      amount,
      method: payForm.method || null,
    });
    const paidAfter = (paidByDebt.get(debt.id) || 0) + amount;
    if (paidAfter >= Number(debt.principal)) {
      await supabase
        .from('debts')
        .update({ status: 'settled' })
        .eq('id', debt.id);
    }
    setSaving(false);
    setPayForm({ date: todayISO(), amount: '', method: '' });
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

  async function deletePayment(id: string) {
    if (!window.confirm('امسح السداد ده؟')) return;
    await getSupabase().from('debt_payments').delete().eq('id', id);
    reload();
  }

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(txForm.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    await getSupabase().from('transactions').insert({
      date: txForm.date,
      type: txForm.type,
      category: txForm.category || null,
      description: txForm.description || null,
      amount,
      currency: txForm.currency,
    });
    setSaving(false);
    setTxForm((f) => ({ ...f, amount: '', description: '' }));
    reload();
  }

  async function deleteTransaction(id: string) {
    if (!window.confirm('امسح الحركة دي؟')) return;
    await getSupabase().from('transactions').delete().eq('id', id);
    reload();
  }

  const filterChips: [DebtFilter, string][] = [
    ['ALL', 'الكل المفتوح'],
    ['ON_ME', '🔻 عليّا'],
    ['TO_ME', '🔺 ليّا'],
    ['SETTLED', '✓ المقفول'],
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">الفلوس</h1>

      {/* التبويبات */}
      <div className="flex gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5">
        {(
          [
            ['OVERVIEW', '📊 نظرة عامة'],
            ['DEBTS', '🤝 الديون'],
            ['TRANSACTIONS', '💸 الدخل والمصاريف'],
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

      {/* ===== نظرة عامة ===== */}
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
              <p className="text-xs text-zinc-400">صافي الشهر ده (بالدرهم)</p>
              <p
                className={`num mt-1 text-lg font-bold ${monthIncomeAED - monthExpenseAED >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {fmtNum(monthIncomeAED - monthExpenseAED)} AED
              </p>
              <p className="num text-xs text-zinc-600">
                دخل {fmtNum(monthIncomeAED)} − مصاريف {fmtNum(monthExpenseAED)}
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
        </div>
      )}

      {/* ===== الديون: دفتر حسابات ===== */}
      {tab === 'DEBTS' && (
        <div className="space-y-4">
          {/* الفلاتر والبحث */}
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

          {/* الجدول */}
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

                            {/* تعديل الدين */}
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

                            {/* تسجيل سداد */}
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
                                  placeholder="الطريقة (فودافون/يد بيد…)"
                                  className={`${inputCls} w-40 text-xs`}
                                />
                                <button
                                  onClick={() => addPayment(d)}
                                  disabled={
                                    saving || !parseFloat(payForm.amount)
                                  }
                                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                                >
                                  سجّل ✓
                                </button>
                              </div>
                            )}

                            {/* تاريخ السدادات */}
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
                                  {debtPayments.map((p) => (
                                    <tr
                                      key={p.id}
                                      className="border-t border-zinc-800/50"
                                    >
                                      <td className="num py-1.5">{p.date}</td>
                                      <td className="num py-1.5 font-bold text-zinc-200">
                                        {fmtNum(Number(p.amount))}
                                      </td>
                                      <td className="py-1.5 text-zinc-400">
                                        {p.method || p.note || '—'}
                                      </td>
                                      <td className="py-1.5 text-left">
                                        <button
                                          onClick={() => deletePayment(p.id)}
                                          className="text-zinc-600 hover:text-red-400"
                                        >
                                          ✕
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
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

      {/* ===== الدخل والمصاريف ===== */}
      {tab === 'TRANSACTIONS' && (
        <div className="space-y-4">
          <form
            onSubmit={addTransaction}
            className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-6"
          >
            <select
              value={txForm.type}
              onChange={(e) =>
                setTxForm({
                  ...txForm,
                  type: e.target.value as 'income' | 'expense',
                })
              }
              className={inputCls}
            >
              <option value="expense">مصروف 🔻</option>
              <option value="income">دخل 🔺</option>
            </select>
            <input
              type="date"
              dir="ltr"
              value={txForm.date}
              onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
              className={inputCls}
            />
            <input
              type="number"
              step="any"
              dir="ltr"
              value={txForm.amount}
              onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
              placeholder="المبلغ"
              required
              className={inputCls}
            />
            <select
              value={txForm.currency}
              onChange={(e) =>
                setTxForm({ ...txForm, currency: e.target.value as Currency })
              }
              className={inputCls}
            >
              <option value="EGP">جنيه</option>
              <option value="AED">درهم</option>
            </select>
            <input
              value={txForm.category}
              onChange={(e) =>
                setTxForm({ ...txForm, category: e.target.value })
              }
              placeholder="التصنيف (مرتب/إيجار…)"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
            >
              تسجيل
            </button>
            <input
              value={txForm.description}
              onChange={(e) =>
                setTxForm({ ...txForm, description: e.target.value })
              }
              placeholder="وصف (اختياري)"
              className={`${inputCls} md:col-span-6`}
            />
          </form>

          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-right text-xs text-zinc-500">
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">الوصف</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-600">
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
                        t.type === 'income'
                          ? 'text-emerald-300'
                          : 'text-red-300'
                      }`}
                    >
                      {fmtMoney(Number(t.amount), t.currency)}
                    </td>
                    <td className="p-3 text-zinc-400">{t.category || '—'}</td>
                    <td className="p-3 text-zinc-400">
                      {t.description || '—'}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => deleteTransaction(t.id)}
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
        </div>
      )}
    </div>
  );
}
