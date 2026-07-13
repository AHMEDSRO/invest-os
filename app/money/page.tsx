'use client';

import { useMemo, useState } from 'react';
import { fmtMoney, fmtNum, currentMonth, todayISO } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import type {
  Currency,
  DebtDirection,
  DebtRow,
  MonthlyObligation,
  Transaction,
  TxType,
} from '@/lib/types';
import { useFinanceData } from '@/lib/useFinanceData';
import { useLiveFx } from '@/lib/useLiveFx';

type Tab = 'POCKETS' | 'DEBTS' | 'ACTIVITY';
type DebtFilter = 'ALL' | 'ON_ME' | 'TO_ME' | 'SETTLED';

const POCKET_LABEL: Record<Currency, string> = { EGP: 'مصر', AED: 'الإمارات' };
const POCKET_FLAG: Record<Currency, string> = { EGP: '🇪🇬', AED: '🇦🇪' };
const TX_TYPE_LABEL: Record<TxType, string> = {
  income: 'دخل',
  expense: 'مصروف',
  transfer_out: 'تحويل خارج',
  transfer_in: 'تحويل داخل',
};

const inputCls =
  'rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500';
const card = 'rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5';

type TxFormState = {
  id: string | null;
  date: string;
  type: 'income' | 'expense';
  currency: Currency;
  amount: string;
  category: string;
};
const emptyTxForm = (currency: Currency = 'EGP'): TxFormState => ({
  id: null,
  date: todayISO(),
  type: 'expense',
  currency,
  amount: '',
  category: '',
});

export default function MoneyPage() {
  const {
    people,
    debts,
    payments,
    transactions,
    obligations,
    fxRate,
    loading,
    error,
    reload,
  } = useFinanceData();

  const liveFxRate = useLiveFx(fxRate);
  const toEGP = (amount: number, currency: string) =>
    currency === 'AED' ? amount * liveFxRate : amount;

  const [tab, setTab] = useState<Tab>('POCKETS');
  const [filter, setFilter] = useState<DebtFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>('');

  // فورم حركة (دخل/مصروف) — واحد بس، يفتح جوه أي جيبة
  const [txForm, setTxForm] = useState<TxFormState>(emptyTxForm());

  // فورم التحويل
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRate, setTransferRate] = useState(liveFxRate.toFixed(2));

  // فورم الالتزامات
  const [showAddObligation, setShowAddObligation] = useState(false);
  const emptyObligForm = {
    name: '',
    amount: '',
    currency: 'EGP' as Currency,
    due_day: '',
  };
  const [obligForm, setObligForm] = useState(emptyObligForm);
  const [editingObligation, setEditingObligation] = useState<string | null>(
    null
  );
  const [obligEdit, setObligEdit] = useState(emptyObligForm);

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

  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [payEdit, setPayEdit] = useState({ date: '', amount: '', method: '' });
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

  // ===== رصيد كل جيبة (مستمر — مفيش دورة، الرصيد بيتراكم) =====
  function pocketBalance(currency: Currency): number {
    const txBalance = transactions
      .filter((t) => t.currency === currency)
      .reduce((s, t) => {
        const sign =
          t.type === 'income' || t.type === 'transfer_in' ? 1 : -1;
        return s + sign * Number(t.amount);
      }, 0);
    const debtPaid = payments
      .filter((p) => {
        const d = debtById.get(p.debt_id);
        return d?.direction === 'on_me' && d?.currency === currency;
      })
      .reduce((s, p) => s + Number(p.amount), 0);
    return txBalance - debtPaid;
  }

  const egBalance = pocketBalance('EGP');
  const aeBalance = pocketBalance('AED');

  function pocketIncome(currency: Currency) {
    return transactions
      .filter((t) => t.currency === currency && t.type === 'income')
      .reduce((s, t) => s + Number(t.amount), 0);
  }
  function pocketExpense(currency: Currency) {
    return transactions
      .filter((t) => t.currency === currency && t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount), 0);
  }

  const activeObligations = obligations.filter((o) => o.is_active);
  const unpaidObligations = activeObligations.filter(
    (o) => o.last_paid_month !== currentMonth()
  );
  const obligEGP = unpaidObligations
    .filter((o) => o.currency === 'EGP')
    .reduce((s, o) => s + Number(o.amount), 0);
  const obligAED = unpaidObligations
    .filter((o) => o.currency === 'AED')
    .reduce((s, o) => s + Number(o.amount), 0);

  // ===== أفعال =====

  async function saveTx(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(txForm.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    setActionError(null);
    const supabase = getSupabase();
    const { error } = txForm.id
      ? await supabase
          .from('transactions')
          .update({
            date: txForm.date,
            category: txForm.category || null,
            amount,
            currency: txForm.currency,
          })
          .eq('id', txForm.id)
      : await supabase.from('transactions').insert({
          date: txForm.date,
          type: txForm.type,
          category: txForm.category || null,
          description: null,
          amount,
          currency: txForm.currency,
        });
    setSaving(false);
    if (error) {
      setActionError('حصل خطأ في الحفظ — القيمة لسه في الفورم، جرب تاني');
      return;
    }
    setTxForm(emptyTxForm(txForm.currency));
    reload();
  }

  function editTx(t: Transaction) {
    if (t.type === 'transfer_in' || t.type === 'transfer_out') {
      setActionError(
        'دي حركة تحويل — لو عايز تعدلها امسحها واعمل تحويل جديد بالمبلغ الصح'
      );
      return;
    }
    setTxForm({
      id: t.id,
      date: t.date,
      type: t.type as 'income' | 'expense',
      currency: t.currency,
      amount: String(t.amount),
      category: t.category || '',
    });
    setTab('POCKETS');
  }

  async function deleteTx(t: Transaction) {
    const supabase = getSupabase();
    if (t.transfer_group) {
      if (
        !window.confirm(
          'دي عملية تحويل مربوطة بجيبة تانية — هتتمسح حركة الخصم والإضافة مع بعض. متأكد؟'
        )
      )
        return;
      await supabase
        .from('transactions')
        .delete()
        .eq('transfer_group', t.transfer_group);
    } else {
      if (!window.confirm('امسح الحركة دي؟')) return;
      await supabase.from('transactions').delete().eq('id', t.id);
    }
    reload();
  }

  async function doTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    const rate = parseFloat(transferRate);
    if (!amount || amount <= 0 || !rate || rate <= 0) return;
    setSaving(true);
    setActionError(null);
    const supabase = getSupabase();
    const group = crypto.randomUUID();
    const today = todayISO();
    const egpAmount = Math.round(amount * rate);
    const { error: e1 } = await supabase.from('transactions').insert({
      date: today,
      type: 'transfer_out',
      category: 'تحويل لمصر',
      amount,
      currency: 'AED',
      transfer_group: group,
    });
    const { error: e2 } = await supabase.from('transactions').insert({
      date: today,
      type: 'transfer_in',
      category: 'تحويل من الإمارات',
      amount: egpAmount,
      currency: 'EGP',
      transfer_group: group,
    });
    setSaving(false);
    if (e1 || e2) {
      setActionError('حصل خطأ في تسجيل التحويل — جرب تاني');
      return;
    }
    setTransferAmount('');
    reload();
  }

  async function addObligation(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(obligForm.amount);
    if (!obligForm.name.trim() || !amount || amount <= 0) return;
    setSaving(true);
    setActionError(null);
    const { error } = await getSupabase().from('monthly_obligations').insert({
      name: obligForm.name.trim(),
      amount,
      currency: obligForm.currency,
      due_day: obligForm.due_day ? parseInt(obligForm.due_day) : null,
    });
    setSaving(false);
    if (error) {
      setActionError('حصل خطأ في إضافة الالتزام — جرب تاني');
      return;
    }
    setShowAddObligation(false);
    setObligForm(emptyObligForm);
    reload();
  }

  function startEditObligation(o: MonthlyObligation) {
    setEditingObligation(o.id);
    setObligEdit({
      name: o.name,
      amount: String(o.amount),
      currency: o.currency,
      due_day: o.due_day ? String(o.due_day) : '',
    });
  }

  async function saveEditObligation(id: string) {
    const amount = parseFloat(obligEdit.amount);
    if (!obligEdit.name.trim() || !amount || amount <= 0) return;
    await getSupabase()
      .from('monthly_obligations')
      .update({
        name: obligEdit.name.trim(),
        amount,
        currency: obligEdit.currency,
        due_day: obligEdit.due_day ? parseInt(obligEdit.due_day) : null,
      })
      .eq('id', id);
    setEditingObligation(null);
    reload();
  }

  async function deleteObligation(id: string) {
    if (!window.confirm('امسح الالتزام ده نهائيًا؟')) return;
    await getSupabase().from('monthly_obligations').delete().eq('id', id);
    reload();
  }

  async function toggleObligationPaid(o: MonthlyObligation) {
    const supabase = getSupabase();
    const isPaid = o.last_paid_month === currentMonth();
    if (isPaid) {
      await supabase
        .from('monthly_obligations')
        .update({ last_paid_month: null })
        .eq('id', o.id);
    } else {
      await supabase
        .from('monthly_obligations')
        .update({ last_paid_month: currentMonth() })
        .eq('id', o.id);
      // بيسجل مصروف فعلي في جيبة الالتزام ده تلقائي عشان الرصيد يتحدث معاه
      await supabase.from('transactions').insert({
        date: todayISO(),
        type: 'expense',
        category: o.name,
        amount: o.amount,
        currency: o.currency,
      });
    }
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
      .update({ date: payEdit.date, amount, method: payEdit.method || null })
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

  const filterChips: [DebtFilter, string][] = [
    ['ALL', 'الكل المفتوح'],
    ['ON_ME', '🔻 عليّا'],
    ['TO_ME', '🔺 ليّا'],
    ['SETTLED', '✓ المقفول'],
  ];

  const visibleActivity = transactions.filter((t) =>
    monthFilter ? t.date.startsWith(monthFilter) : true
  );

  // ===== مكوّن صف حركة — سطر واحد كثيف بدل كارت كبير =====
  function txRow(t: Transaction) {
    const isPositive = t.type === 'income' || t.type === 'transfer_in';
    return (
      <div
        key={t.id}
        className="flex flex-wrap items-center gap-2 border-b border-zinc-800/70 py-2.5 last:border-0"
      >
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
          {POCKET_FLAG[t.currency]} {POCKET_LABEL[t.currency]}
        </span>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-bold ${
            isPositive
              ? 'bg-emerald-950 text-emerald-300'
              : 'bg-red-950 text-red-300'
          }`}
        >
          {TX_TYPE_LABEL[t.type]}
        </span>
        <span className="flex-1 text-sm text-zinc-300">
          {t.category || '—'}
        </span>
        <span className="num text-xs text-zinc-600">{t.date}</span>
        <span
          className={`num w-28 text-left text-sm font-bold ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}
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
          onClick={() => deleteTx(t)}
          className="text-zinc-600 hover:text-red-400"
          title="حذف"
        >
          🗑
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
            ['POCKETS', '🏠 الجيوب'],
            ['DEBTS', '🤝 الديون'],
            ['ACTIVITY', '🗂 كل الحركات'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-bold transition-colors sm:px-4 sm:py-2.5 sm:text-sm ${
              tab === key
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ============ الجيوب ============ */}
      {tab === 'POCKETS' && (
        <div className="space-y-4">
          {/* رصيد الجيبتين */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className={card}>
              <p className="text-xs text-zinc-500">🇪🇬 جيبة مصر</p>
              <p
                className={`num mt-1 text-3xl font-bold ${egBalance >= 0 ? 'text-emerald-300' : 'text-red-400'}`}
              >
                {fmtNum(egBalance)} EGP
              </p>
              <p className="num mt-1 text-xs text-zinc-600">
                دخل {fmtNum(pocketIncome('EGP'))} − مصروف{' '}
                {fmtNum(pocketExpense('EGP'))}
              </p>
            </div>
            <div className={card}>
              <p className="text-xs text-zinc-500">🇦🇪 جيبة الإمارات</p>
              <p
                className={`num mt-1 text-3xl font-bold ${aeBalance >= 0 ? 'text-emerald-300' : 'text-red-400'}`}
              >
                {fmtNum(aeBalance)} AED
              </p>
              <p className="num mt-1 text-xs text-zinc-600">
                دخل {fmtNum(pocketIncome('AED'))} − مصروف/تحويل{' '}
                {fmtNum(pocketExpense('AED'))}
              </p>
            </div>
          </div>

          {/* التحويل */}
          <div className={card}>
            <h2 className="mb-3 text-sm font-bold text-zinc-200">
              🔄 حوّل من الإمارات لمصر
            </h2>
            <form
              onSubmit={doTransfer}
              className="flex flex-wrap items-end gap-2"
            >
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  المبلغ (درهم)
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className={`${inputCls} w-32`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  سعر اليوم
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={transferRate}
                  onChange={(e) => setTransferRate(e.target.value)}
                  className={`${inputCls} w-24`}
                />
              </div>
              {parseFloat(transferAmount) > 0 && (
                <p className="num pb-2 text-xs text-zinc-500">
                  هيوصل مصر:{' '}
                  <span className="font-bold text-amber-300">
                    {fmtNum(
                      parseFloat(transferAmount) *
                        (parseFloat(transferRate) || 0)
                    )}{' '}
                    EGP
                  </span>
                </p>
              )}
              <button
                type="submit"
                disabled={saving || !parseFloat(transferAmount)}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
              >
                تحويل
              </button>
            </form>
          </div>

          {/* الالتزامات الشهرية */}
          <div className={card}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-zinc-200">
                الالتزامات الشهرية الثابتة
              </h2>
              <p className="num text-xs text-zinc-500">
                المطلوب منك الشهر ده:{' '}
                <span className="font-bold text-amber-300">
                  {fmtNum(obligEGP)} EGP + {fmtNum(obligAED)} AED
                </span>
              </p>
            </div>

            <div className="divide-y divide-zinc-800/70">
              {activeObligations.length === 0 && (
                <p className="py-3 text-xs text-zinc-600">
                  لسه مفيش التزامات مسجلة
                </p>
              )}
              {activeObligations.map((o) => {
                const isPaid = o.last_paid_month === currentMonth();
                const isEditing = editingObligation === o.id;
                if (isEditing) {
                  return (
                    <div
                      key={o.id}
                      className="flex flex-wrap items-center gap-2 py-2.5"
                    >
                      <input
                        value={obligEdit.name}
                        onChange={(e) =>
                          setObligEdit({ ...obligEdit, name: e.target.value })
                        }
                        className={`${inputCls} flex-1 basis-32`}
                      />
                      <input
                        type="number"
                        step="any"
                        dir="ltr"
                        value={obligEdit.amount}
                        onChange={(e) =>
                          setObligEdit({
                            ...obligEdit,
                            amount: e.target.value,
                          })
                        }
                        className={`${inputCls} w-24`}
                      />
                      <select
                        value={obligEdit.currency}
                        onChange={(e) =>
                          setObligEdit({
                            ...obligEdit,
                            currency: e.target.value as Currency,
                          })
                        }
                        className={inputCls}
                      >
                        <option value="EGP">جنيه</option>
                        <option value="AED">درهم</option>
                      </select>
                      <input
                        type="number"
                        dir="ltr"
                        value={obligEdit.due_day}
                        onChange={(e) =>
                          setObligEdit({
                            ...obligEdit,
                            due_day: e.target.value,
                          })
                        }
                        placeholder="يوم الاستحقاق"
                        className={`${inputCls} w-28`}
                      />
                      <button
                        onClick={() => saveEditObligation(o.id)}
                        className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950"
                      >
                        حفظ
                      </button>
                      <button
                        onClick={() => setEditingObligation(null)}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400"
                      >
                        إلغاء
                      </button>
                    </div>
                  );
                }
                return (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center gap-2 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={isPaid}
                      onChange={() => toggleObligationPaid(o)}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                      {POCKET_FLAG[o.currency]} {POCKET_LABEL[o.currency]}
                    </span>
                    <span
                      className={`flex-1 text-sm ${isPaid ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}
                    >
                      {o.name}
                    </span>
                    {o.due_day && (
                      <span className="num text-xs text-zinc-600">
                        يوم {o.due_day}
                      </span>
                    )}
                    <span className="num w-28 text-left text-sm font-bold text-zinc-300">
                      {fmtMoney(Number(o.amount), o.currency)}
                    </span>
                    <button
                      onClick={() => startEditObligation(o)}
                      className="text-zinc-600 hover:text-amber-300"
                      title="تعديل"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteObligation(o.id)}
                      className="text-zinc-600 hover:text-red-400"
                      title="حذف"
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>

            {showAddObligation ? (
              <form
                onSubmit={addObligation}
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-800 pt-3"
              >
                <input
                  value={obligForm.name}
                  onChange={(e) =>
                    setObligForm({ ...obligForm, name: e.target.value })
                  }
                  placeholder="اسم الالتزام"
                  className={`${inputCls} flex-1 basis-32`}
                />
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={obligForm.amount}
                  onChange={(e) =>
                    setObligForm({ ...obligForm, amount: e.target.value })
                  }
                  placeholder="المبلغ"
                  className={`${inputCls} w-24`}
                />
                <select
                  value={obligForm.currency}
                  onChange={(e) =>
                    setObligForm({
                      ...obligForm,
                      currency: e.target.value as Currency,
                    })
                  }
                  className={inputCls}
                >
                  <option value="EGP">جنيه</option>
                  <option value="AED">درهم</option>
                </select>
                <input
                  type="number"
                  dir="ltr"
                  value={obligForm.due_day}
                  onChange={(e) =>
                    setObligForm({ ...obligForm, due_day: e.target.value })
                  }
                  placeholder="يوم الاستحقاق (اختياري)"
                  className={`${inputCls} w-40`}
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
                >
                  إضافة
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowAddObligation(true)}
                className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:border-amber-500 hover:text-amber-300"
              >
                + التزام جديد
              </button>
            )}
          </div>

          {/* تسجيل حركة + آخر الحركات */}
          <div className={card}>
            <h2 className="mb-3 text-sm font-bold text-zinc-200">
              سجّل دخل أو مصروف
            </h2>
            <form
              onSubmit={saveTx}
              className="mb-4 flex flex-wrap items-end gap-2 border-b border-zinc-800 pb-4"
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
                disabled={!!txForm.id}
              >
                <option value="expense">مصروف 🔻</option>
                <option value="income">دخل 🔺</option>
              </select>
              <select
                value={txForm.currency}
                onChange={(e) =>
                  setTxForm({
                    ...txForm,
                    currency: e.target.value as Currency,
                  })
                }
                className={inputCls}
              >
                <option value="EGP">🇪🇬 جنيه</option>
                <option value="AED">🇦🇪 درهم</option>
              </select>
              <input
                type="number"
                step="any"
                dir="ltr"
                value={txForm.amount}
                onChange={(e) =>
                  setTxForm({ ...txForm, amount: e.target.value })
                }
                placeholder="المبلغ"
                className={`${inputCls} w-28`}
              />
              <input
                value={txForm.category}
                onChange={(e) =>
                  setTxForm({ ...txForm, category: e.target.value })
                }
                placeholder="وصف (اختياري)"
                className={`${inputCls} flex-1 basis-32`}
              />
              <input
                type="date"
                dir="ltr"
                value={txForm.date}
                onChange={(e) =>
                  setTxForm({ ...txForm, date: e.target.value })
                }
                className={inputCls}
              />
              <button
                type="submit"
                disabled={saving || !parseFloat(txForm.amount)}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                {txForm.id ? 'حفظ التعديل' : '+ أضف'}
              </button>
              {txForm.id && (
                <button
                  type="button"
                  onClick={() => setTxForm(emptyTxForm())}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400"
                >
                  إلغاء
                </button>
              )}
            </form>

            <h3 className="mb-2 text-xs font-bold text-zinc-500">
              آخر الحركات
            </h3>
            {transactions.length === 0 ? (
              <p className="text-xs text-zinc-600">لسه مفيش حركات مسجلة</p>
            ) : (
              <div>{transactions.slice(0, 10).map(txRow)}</div>
            )}
          </div>
        </div>
      )}

      {/* ============ الديون ============ */}
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
              className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-3"
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
                              <div className="mb-4 grid gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-3 md:grid-cols-5">
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

      {/* ============ كل الحركات ============ */}
      {tab === 'ACTIVITY' && (
        <div className="space-y-3">
          <input
            type="month"
            dir="ltr"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className={`${inputCls} w-40`}
            placeholder="فلتر بالشهر"
          />
          <div className={card}>
            {visibleActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-600">
                مفيش حركات في الفترة دي
              </p>
            ) : (
              <div>{visibleActivity.map(txRow)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
