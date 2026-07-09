'use client';

import { useMemo, useState } from 'react';
import { fmtMoney, fmtNum, todayISO } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import type { Currency, DebtDirection, DebtRow } from '@/lib/types';
import { useFinanceData } from '@/lib/useFinanceData';

type Tab = 'OVERVIEW' | 'DEBTS' | 'TRANSACTIONS';

const toAED = (amount: number, currency: string, rate: number) =>
  currency === 'EGP' ? amount / rate : amount;

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
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  // فورم إضافة دين
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [debtForm, setDebtForm] = useState({
    personName: '',
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

  // فورم حركة (دخل/مصروف)
  const [txForm, setTxForm] = useState({
    date: todayISO(),
    type: 'expense' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
    currency: 'EGP' as Currency,
  });

  const [saving, setSaving] = useState(false);

  const paidByDebt = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) {
      m.set(p.debt_id, (m.get(p.debt_id) || 0) + Number(p.amount));
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

  // تجميع الديون بالشخص
  const debtsByPerson = new Map<string, DebtRow[]>();
  for (const d of debts) {
    if (!showSettled && d.status === 'settled') continue;
    const list = debtsByPerson.get(d.person_id) || [];
    list.push(d);
    debtsByPerson.set(d.person_id, list);
  }

  async function addDebt(e: React.FormEvent) {
    e.preventDefault();
    const principal = parseFloat(debtForm.principal);
    const name = debtForm.personName.trim();
    if (!name || !principal || principal <= 0) return;
    setSaving(true);
    const supabase = getSupabase();

    // شخص موجود بنفس الاسم؟ وإلا نضيفه
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
    setDebtForm({
      personName: '',
      direction: 'on_me',
      title: '',
      principal: '',
      currency: 'EGP',
      note: '',
    });
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
    // لو السداد كمّل الدين → يتقفل تلقائي
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
        `متأكد إنك عايز تمسح دين «${debt.title}» بكل سداداته نهائيًا؟`
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

  const inputCls =
    'rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500';

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
              <p className="text-xs text-red-300/80">عليك (ديون مفتوحة)</p>
              <p className="num mt-1 text-lg font-bold text-red-300">
                {fmtNum(onMeEGP)} EGP
              </p>
              <p className="num text-sm text-red-300/70">
                + {fmtNum(onMeAED)} AED
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
              <p className="text-xs text-emerald-300/80">ليك عند الناس</p>
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
              <p className="text-xs text-zinc-600">
                اللي ليك ناقص اللي عليك
              </p>
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

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              أكبر الديون المفتوحة عليك
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
                      {personById.get(d.person_id)?.name} — {d.title}
                    </span>
                    <span className="num font-bold text-red-300">
                      {fmtMoney(remaining(d), d.currency)}
                    </span>
                  </li>
                ))}
              {openDebts.filter((d) => d.direction === 'on_me').length ===
                0 && (
                <li className="text-sm text-emerald-400">
                  مفيش ديون مفتوحة عليك 🎉
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ===== الديون ===== */}
      {tab === 'DEBTS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={showSettled}
                onChange={(e) => setShowSettled(e.target.checked)}
                className="accent-amber-500"
              />
              اعرض المقفولة كمان
            </label>
            <button
              onClick={() => setShowAddDebt(!showAddDebt)}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400"
            >
              {showAddDebt ? 'إغلاق' : '+ دين جديد'}
            </button>
          </div>

          {showAddDebt && (
            <form
              onSubmit={addDebt}
              className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-3"
            >
              <input
                list="people-list"
                value={debtForm.personName}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, personName: e.target.value })
                }
                placeholder="اسم الشخص/الجهة (جديد أو موجود)"
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
                <option value="on_me">عليّا (أنا مديون)</option>
                <option value="to_me">ليّا (هو مديون ليا)</option>
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

          {Array.from(debtsByPerson.entries()).map(([personId, list]) => {
            const person = personById.get(personId);
            return (
              <div
                key={personId}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <h3 className="mb-3 font-bold text-zinc-100">
                  👤 {person?.name || '—'}
                </h3>
                <div className="space-y-2">
                  {list.map((d) => {
                    const paid = paidByDebt.get(d.id) || 0;
                    const rem = remaining(d);
                    const debtPayments = payments.filter(
                      (p) => p.debt_id === d.id
                    );
                    const isExpanded = expandedDebt === d.id;
                    return (
                      <div
                        key={d.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-950"
                      >
                        <button
                          onClick={() =>
                            setExpandedDebt(isExpanded ? null : d.id)
                          }
                          className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-right"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                d.direction === 'on_me'
                                  ? 'bg-red-950 text-red-300'
                                  : 'bg-emerald-950 text-emerald-300'
                              }`}
                            >
                              {d.direction === 'on_me' ? 'عليك' : 'ليك'}
                            </span>
                            <span className="text-zinc-200">{d.title}</span>
                            {d.status === 'settled' && (
                              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                مقفول ✓
                              </span>
                            )}
                          </span>
                          <span className="num text-sm">
                            <span className="text-zinc-500">
                              {fmtNum(paid)} من {fmtNum(Number(d.principal))}
                            </span>{' '}
                            <span
                              className={`font-bold ${
                                d.direction === 'on_me'
                                  ? 'text-red-300'
                                  : 'text-emerald-300'
                              }`}
                            >
                              باقي {fmtMoney(rem, d.currency)}
                            </span>
                          </span>
                        </button>

                        {/* شريط التقدم */}
                        <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full ${d.direction === 'on_me' ? 'bg-red-500/70' : 'bg-emerald-500/70'}`}
                            style={{
                              width: `${Math.min(100, (paid / Number(d.principal)) * 100)}%`,
                            }}
                          />
                        </div>

                        {isExpanded && (
                          <div className="border-t border-zinc-800 p-3">
                            {d.note && (
                              <p className="mb-2 text-xs text-amber-300/80">
                                📝 {d.note}
                              </p>
                            )}

                            {/* تاريخ السدادات */}
                            {debtPayments.length > 0 ? (
                              <table className="mb-3 w-full text-xs">
                                <thead>
                                  <tr className="text-right text-zinc-600">
                                    <th className="py-1">التاريخ</th>
                                    <th className="py-1">المبلغ</th>
                                    <th className="py-1">الطريقة</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {debtPayments.map((p) => (
                                    <tr
                                      key={p.id}
                                      className="border-t border-zinc-800/60"
                                    >
                                      <td className="num py-1.5">{p.date}</td>
                                      <td className="num py-1.5 font-medium">
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
                              <p className="mb-3 text-xs text-zinc-600">
                                لسه مفيش سدادات مسجلة
                              </p>
                            )}

                            {/* تسجيل سداد */}
                            {d.status === 'open' && (
                              <div className="mb-3 flex flex-wrap gap-2">
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
                                  className={`${inputCls} w-24 text-xs`}
                                />
                                <input
                                  value={payForm.method}
                                  onChange={(e) =>
                                    setPayForm({
                                      ...payForm,
                                      method: e.target.value,
                                    })
                                  }
                                  placeholder="الطريقة (اختياري)"
                                  className={`${inputCls} w-32 text-xs`}
                                />
                                <button
                                  onClick={() => addPayment(d)}
                                  disabled={saving || !parseFloat(payForm.amount)}
                                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-zinc-950 disabled:opacity-40"
                                >
                                  سجّل سداد
                                </button>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={() => toggleSettled(d)}
                                className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300"
                              >
                                {d.status === 'open'
                                  ? 'اقفله (اتسدد)'
                                  : 'افتحه تاني'}
                              </button>
                              <button
                                onClick={() => deleteDebt(d)}
                                className="rounded-lg border border-zinc-800 px-3 py-1 text-xs text-zinc-500 hover:border-red-600 hover:text-red-400"
                              >
                                حذف نهائي
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
              onChange={(e) =>
                setTxForm({ ...txForm, amount: e.target.value })
              }
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
              placeholder="التصنيف (مرتب/إيجار/أكل…)"
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
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          t.type === 'income'
                            ? 'bg-emerald-950 text-emerald-300'
                            : 'bg-red-950 text-red-300'
                        }`}
                      >
                        {t.type === 'income' ? 'دخل' : 'مصروف'}
                      </span>
                    </td>
                    <td
                      className={`num p-3 font-medium ${
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
