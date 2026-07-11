'use client';

import { useMemo, useState } from 'react';
import { fmtMoney, fmtNum, todayISO } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import type {
  Currency,
  DebtDirection,
  DebtRow,
  Transaction,
} from '@/lib/types';
import { useFinanceData } from '@/lib/useFinanceData';
import { useLiveFx } from '@/lib/useLiveFx';

type Tab = 'MONTH' | 'DEBTS' | 'OVERVIEW' | 'HISTORY';
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
  const {
    people,
    debts,
    payments,
    transactions,
    wallet,
    fxRate,
    loading,
    error,
    reload,
  } = useFinanceData();

  // سعر AED/EGP حي — بيتحدث لوحده باستمرار، وبيرجع لآخر سعر مخزّن لو الإنترنت فصل
  const liveFxRate = useLiveFx(fxRate);

  const [tab, setTab] = useState<Tab>('MONTH');
  const [filter, setFilter] = useState<DebtFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // فورمات الدخل والمصاريف (لكل نوع فورم مستقل + وضع تعديل)
  const [txForms, setTxForms] = useState<Record<TxType, TxFormState>>({
    income: emptyTxForm(),
    expense: emptyTxForm(),
  });

  // سداد من خطة الشهر: اختيار دين + مبلغ
  const [payTarget, setPayTarget] = useState<string>('');
  const [payTargetAmount, setPayTargetAmount] = useState<string>('');

  // ضبط رصيد المحفظة
  const [showWalletForm, setShowWalletForm] = useState(false);
  const [walletForm, setWalletForm] = useState({
    amount: '',
    currency: 'AED' as Currency,
  });

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

  // ===== حسابات الشهر الحالي =====
  const monthKey = todayISO().slice(0, 7);
  const monthTx = transactions.filter((t) => t.date.startsWith(monthKey));
  const sumTx = (type: TxType, currency: Currency) =>
    monthTx
      .filter((t) => t.type === type && t.currency === currency)
      .reduce((s, t) => s + Number(t.amount), 0);
  const incomeEGP = sumTx('income', 'EGP');
  const incomeAED = sumTx('income', 'AED');
  const expenseEGP = sumTx('expense', 'EGP');
  const expenseAED = sumTx('expense', 'AED');

  // سداد ديون (اللي عليك) المسجل الشهر ده — بيتخصم من المتبقي
  const monthDebtPaid = (currency: Currency) =>
    payments
      .filter((p) => {
        const d = debtById.get(p.debt_id);
        return (
          p.date.startsWith(monthKey) &&
          d?.direction === 'on_me' &&
          d?.currency === currency
        );
      })
      .reduce((s, p) => s + Number(p.amount), 0);
  const debtPaidEGP = monthDebtPaid('EGP');
  const debtPaidAED = monthDebtPaid('AED');

  const leftoverEGP = incomeEGP - expenseEGP - debtPaidEGP;
  const leftoverAED = incomeAED - expenseAED - debtPaidAED;
  const leftoverUnified = toAED(leftoverEGP, 'EGP', liveFxRate) + leftoverAED;

  // ===== رصيد المحفظة الموحّد بالجنيه (بيتحدث لحظيًا بسعر اليوم) =====
  // = الرصيد الأساسي اللي حطيته + كل الدخل − كل المصاريف − سداد الديون
  // من تاريخ ما ضبطت رصيدك بس — سدادات وحركات قبل كده (زي المرحّلة من إكسيلك
  // القديم) حصلت فعليًا زمان وخلصت، مش بتخصم من رصيدك النهاردة
  const walletSetDate = wallet ? wallet.updated_at.slice(0, 10) : todayISO();
  const toEGP = (amount: number, currency: string) =>
    currency === 'AED' ? amount * liveFxRate : amount;

  const allIncomeEGP = transactions
    .filter((t) => t.type === 'income' && t.date >= walletSetDate)
    .reduce((s, t) => s + toEGP(Number(t.amount), t.currency), 0);
  const allExpenseEGP = transactions
    .filter((t) => t.type === 'expense' && t.date >= walletSetDate)
    .reduce((s, t) => s + toEGP(Number(t.amount), t.currency), 0);
  const allDebtPaidOnMeEGP = payments
    .filter(
      (p) =>
        p.date >= walletSetDate &&
        debtById.get(p.debt_id)?.direction === 'on_me'
    )
    .reduce((s, p) => {
      const d = debtById.get(p.debt_id);
      return s + toEGP(Number(p.amount), d?.currency || 'EGP');
    }, 0);

  const walletBaselineEGP = wallet
    ? toEGP(Number(wallet.balance), wallet.currency)
    : 0;
  const currentBalanceEGP =
    walletBaselineEGP + allIncomeEGP - allExpenseEGP - allDebtPaidOnMeEGP;
  const currentBalanceAED = currentBalanceEGP / liveFxRate;

  // ===== أفعال =====

  async function saveWallet(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(walletForm.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    await getSupabase()
      .from('wallet')
      .update({
        balance: amount,
        currency: walletForm.currency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    setSaving(false);
    setShowWalletForm(false);
    setWalletForm({ amount: '', currency: 'AED' });
    reload();
  }

  async function saveTx(type: TxType) {
    const f = txForms[type];
    const amount = parseFloat(f.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    const supabase = getSupabase();
    const payload = {
      date: f.date,
      type,
      category: f.category || null,
      description: null,
      amount,
      currency: f.currency,
    };
    if (f.id) {
      await supabase.from('transactions').update(payload).eq('id', f.id);
    } else {
      await supabase.from('transactions').insert(payload);
    }
    setSaving(false);
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
    if (tab === 'HISTORY') setTab('MONTH');
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
    const supabase = getSupabase();
    await supabase.from('debt_payments').insert({
      debt_id: debt.id,
      date: todayISO(),
      amount,
      method: method || null,
    });
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
    const supabase = getSupabase();
    await supabase.from('debt_payments').insert({
      debt_id: debt.id,
      date: payForm.date,
      amount,
      method: payForm.method || null,
    });
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
    const list = monthTx
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

        {/* فورم إضافة/تعديل */}
        <div className="mb-3 flex flex-wrap gap-2">
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
            placeholder="المبلغ"
            className={`${inputCls} w-24`}
          />
          <select
            value={f.currency}
            onChange={(e) =>
              setTxForms((p) => ({
                ...p,
                [type]: { ...f, currency: e.target.value as Currency },
              }))
            }
            className={inputCls}
          >
            <option value="EGP">جنيه</option>
            <option value="AED">درهم</option>
          </select>
          <input
            value={f.category}
            onChange={(e) =>
              setTxForms((p) => ({
                ...p,
                [type]: { ...f, category: e.target.value },
              }))
            }
            placeholder={isIncome ? 'المصدر' : 'البند'}
            className={`${inputCls} flex-1 basis-24`}
          />
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
            className={`${inputCls} basis-full sm:basis-auto`}
          />
          <button
            onClick={() => saveTx(type)}
            disabled={saving || !parseFloat(f.amount)}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-40 ${
              isIncome
                ? 'bg-emerald-500 hover:bg-emerald-400'
                : 'bg-red-400 hover:bg-red-300'
            }`}
          >
            {f.id ? 'حفظ التعديل' : '+ أضف'}
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

        {/* قائمة الشهر */}
        {list.length === 0 ? (
          <p className="text-xs text-zinc-600">لسه مسجلتش حاجة الشهر ده</p>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {list.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="text-zinc-300">
                  {t.category || (isIncome ? 'دخل' : 'مصروف')}
                  <span className="num mr-2 text-xs text-zinc-600">
                    {t.date.slice(5)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`num font-bold ${isIncome ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {fmtMoney(Number(t.amount), t.currency)}
                  </span>
                  <button
                    onClick={() => editTx(t)}
                    className="text-zinc-600 hover:text-amber-300"
                    title="تعديل"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteTx(t.id)}
                    className="text-zinc-600 hover:text-red-400"
                    title="مسح"
                  >
                    ✕
                  </button>
                </span>
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

      {/* رصيدك الحالي — موحّد بالجنيه، بيتحدث لحظيًا بسعر اليوم */}
      <div className="rounded-2xl border border-amber-600/40 bg-gradient-to-l from-zinc-900 via-zinc-900 to-amber-950/30 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-amber-300/80">
              رصيدك الحالي (محوّل للجنيه تلقائيًا)
            </p>
            <p
              className={`num mt-1 text-3xl font-black ${
                currentBalanceEGP >= 0 ? 'text-amber-300' : 'text-red-400'
              }`}
            >
              {fmtNum(currentBalanceEGP)} EGP
            </p>
            <p className="num mt-0.5 text-xs text-zinc-500">
              ≈ {fmtNum(currentBalanceAED)} AED — سعر اليوم:{' '}
              {fmtNum(liveFxRate, 2)} EGP لكل 1 AED (بيتحدث لوحده)
            </p>
            <p className="num mt-1 text-[11px] text-zinc-600">
              محسوب من تاريخ {walletSetDate} — الحركات والسدادات القديمة قبل
              كده متحسبتش
            </p>
          </div>
          <button
            onClick={() => setShowWalletForm(!showWalletForm)}
            className="rounded-lg border border-amber-600/50 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-zinc-950"
          >
            {showWalletForm ? 'إغلاق' : '✏️ اضبط رصيدك'}
          </button>
        </div>

        {showWalletForm && (
          <form
            onSubmit={saveWallet}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-800 pt-4"
          >
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                معايا كام دلوقتي (يستبدل الرصيد الحالي)
              </label>
              <input
                type="number"
                step="any"
                dir="ltr"
                value={walletForm.amount}
                onChange={(e) =>
                  setWalletForm({ ...walletForm, amount: e.target.value })
                }
                placeholder="مثلًا 9000"
                className={`${inputCls} w-32`}
              />
            </div>
            <select
              value={walletForm.currency}
              onChange={(e) =>
                setWalletForm({
                  ...walletForm,
                  currency: e.target.value as Currency,
                })
              }
              className={inputCls}
            >
              <option value="AED">درهم AED</option>
              <option value="EGP">جنيه EGP</option>
            </select>
            <button
              type="submit"
              disabled={saving || !parseFloat(walletForm.amount)}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
            >
              احفظ رصيدي
            </button>
            <p className="basis-full text-xs leading-5 text-zinc-500">
              بعد الحفظ، رصيدك هيزيد مع أي دخل تسجله وينقص مع أي مصروف أو سداد
              دين تسجله — تلقائيًا.
            </p>
          </form>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5 md:gap-2">
        {(
          [
            ['MONTH', '📅 خطة الشهر'],
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

      {/* ============ خطة الشهر ============ */}
      {tab === 'MONTH' && (
        <div className="space-y-4">
          {/* ١) الدخل والمصاريف جنب بعض — والباقي في آخر السكشن */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5">
            <h2 className="mb-3 text-sm font-bold text-zinc-200">
              ١) دخلك ومصاريفك الشهر ده
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {txColumn('income')}
              {txColumn('expense')}
            </div>

            {/* الباقي بعد الطرح — نهاية السكشن */}
            <div className="mt-4 rounded-xl border border-amber-600/40 bg-gradient-to-l from-zinc-950 to-amber-950/20 p-3 md:p-4">
              <p className="mb-2 text-xs font-bold text-amber-300">
                الباقي معاك بعد المصاريف (دخل − مصاريف − سداد الشهر)
              </p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-zinc-950/70 p-3">
                  <p className="text-[11px] text-zinc-500">بالجنيه</p>
                  <p
                    className={`num text-lg font-black ${leftoverEGP >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {fmtNum(leftoverEGP)} EGP
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-950/70 p-3">
                  <p className="text-[11px] text-zinc-500">بالدرهم</p>
                  <p
                    className={`num text-lg font-black ${leftoverAED >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {fmtNum(leftoverAED)} AED
                  </p>
                </div>
              </div>
              {(debtPaidEGP > 0 || debtPaidAED > 0) && (
                <p className="num mt-2 text-xs text-zinc-500">
                  (اتخصم منه سداد ديون الشهر ده: {fmtNum(debtPaidEGP)} EGP +{' '}
                  {fmtNum(debtPaidAED)} AED)
                </p>
              )}
            </div>
          </div>

          {/* ٢) هتسدد مين من الباقي — اختيار من قائمة */}
          <div className="rounded-2xl border border-amber-600/40 bg-gradient-to-l from-zinc-900 to-amber-950/20 p-4 md:p-5">
            <h2 className="mb-3 text-sm font-bold text-amber-300">
              ٢) هتسدد مين من الباقي؟
            </h2>

            {onMeOpenDebts.length === 0 ? (
              <p className="text-sm text-emerald-400">
                مفيش ديون مفتوحة عليك 🎉
              </p>
            ) : (
              <>
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
                          onChange={(e) => setPayTargetAmount(e.target.value)}
                          placeholder={`${selectedDebt.currency}`}
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
                  <p className="num mt-3 text-sm text-zinc-300">
                    باقي على «{personById.get(selectedDebt.person_id)?.name}»
                    :{' '}
                    <span className="font-bold text-red-300">
                      {fmtMoney(remaining(selectedDebt), selectedDebt.currency)}
                    </span>
                  </p>
                )}
              </>
            )}

            <p className="mt-4 rounded-xl bg-zinc-950/70 px-3 py-2.5 text-xs leading-6 text-zinc-400">
              💡 اللي يفضل معاك بعد المصاريف والسداد هو اللي تستثمره — روح
              للداشبورد واكتبه في كارت «أستثمره فين؟»
            </p>
          </div>
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
              <p className="text-xs text-zinc-400">باقي الشهر ده (بالدرهم)</p>
              <p
                className={`num mt-1 text-lg font-bold ${leftoverUnified >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {fmtNum(leftoverUnified)} AED
              </p>
              <p className="text-xs text-zinc-600">
                بعد المصاريف وسداد الديون
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
                      title="تعديل (هيفتح في خطة الشهر)"
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
  );
}
