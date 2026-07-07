'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtMoney, fmtNum, todayISO } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import { COUNTRY_AR } from '@/lib/types';
import { usePortfolioData } from '@/lib/usePortfolioData';

export default function DepositsPage() {
  const { funds, deposits, loading, error, reload } = usePortfolioData();

  const activeFunds = useMemo(
    () => funds.filter((f) => f.is_active),
    [funds]
  );

  const [form, setForm] = useState({
    date: todayISO(),
    fund_id: '',
    amount: '',
    aed_egp_rate: '',
    nav: '',
    units: '',
    reason: '',
  });
  const [rateSource, setRateSource] = useState<'live' | 'manual' | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selectedFund = activeFunds.find((f) => f.id === form.fund_id);
  const currency = selectedFund?.country === 'AE' ? 'AED' : 'EGP';

  // جلب سعر AED/EGP الحي تلقائيًا (مع إمكانية التعديل اليدوي)
  useEffect(() => {
    let cancelled = false;
    fetch('https://open.er-api.com/v6/latest/AED')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const egp = data?.rates?.EGP;
        if (egp) {
          setForm((f) =>
            f.aed_egp_rate ? f : { ...f, aed_egp_rate: Number(egp).toFixed(2) }
          );
          setRateSource('live');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.fund_id && activeFunds.length > 0) {
      setForm((f) => ({ ...f, fund_id: activeFunds[0].id }));
    }
  }, [activeFunds, form.fund_id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const amount = parseFloat(form.amount);
    const rate = parseFloat(form.aed_egp_rate);
    if (!form.fund_id || !amount || amount <= 0) return;

    setSaving(true);
    const supabase = getSupabase();

    const { error: depErr } = await supabase.from('deposits').insert({
      date: form.date,
      fund_id: form.fund_id,
      amount,
      currency,
      aed_egp_rate: rate || null,
      nav: form.nav ? parseFloat(form.nav) : null,
      units: form.units ? parseFloat(form.units) : null,
      reason: form.reason || null,
    });

    // تسجيل سعر الصرف في fx_history (يغذي رسمة الداشبورد)
    if (!depErr && rate) {
      await supabase
        .from('fx_history')
        .upsert({ date: form.date, aed_egp: rate });
    }

    setSaving(false);
    if (depErr) {
      setMsg('حصل خطأ أثناء الحفظ — حاول تاني');
      return;
    }
    setMsg('الإيداع اتسجل ✓');
    setForm((f) => ({ ...f, amount: '', nav: '', units: '', reason: '' }));
    reload();
  }

  if (loading)
    return <p className="py-20 text-center text-zinc-500">جاري التحميل…</p>;
  if (error)
    return <p className="py-20 text-center text-red-400">{error}</p>;

  const fundById = new Map(funds.map((f) => [f.id, f]));

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">الإيداعات</h1>

      {/* فورم إيداع جديد */}
      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-3"
      >
        <div>
          <label className="mb-1 block text-sm text-zinc-400">التاريخ</label>
          <input
            type="date"
            dir="ltr"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-400">الصندوق</label>
          <select
            value={form.fund_id}
            onChange={(e) => setForm({ ...form, fund_id: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          >
            {activeFunds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({COUNTRY_AR[f.country]})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-400">
            المبلغ ({currency})
          </label>
          <input
            type="number"
            step="any"
            dir="ltr"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-400">
            سعر AED/EGP{' '}
            {rateSource === 'live' && (
              <span className="text-xs text-emerald-400">
                (اتجاب تلقائيًا — تقدر تعدله)
              </span>
            )}
          </label>
          <input
            type="number"
            step="any"
            dir="ltr"
            value={form.aed_egp_rate}
            onChange={(e) => {
              setForm({ ...form, aed_egp_rate: e.target.value });
              setRateSource('manual');
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-400">
            NAV (اختياري)
          </label>
          <input
            type="number"
            step="any"
            dir="ltr"
            value={form.nav}
            onChange={(e) => setForm({ ...form, nav: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-400">
            عدد الوثائق (اختياري)
          </label>
          <input
            type="number"
            step="any"
            dir="ltr"
            value={form.units}
            onChange={(e) => setForm({ ...form, units: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-zinc-400">
            السبب / ملاحظة (اختياري)
          </label>
          <input
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-end gap-3">
          <button
            type="submit"
            disabled={saving || activeFunds.length === 0}
            className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ…' : 'تسجيل الإيداع'}
          </button>
          {msg && (
            <span
              className={`text-sm ${
                msg.includes('خطأ') ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {msg}
            </span>
          )}
        </div>
      </form>

      {/* جدول كل الإيداعات */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-right text-xs text-zinc-500">
              <th className="p-3">التاريخ</th>
              <th className="p-3">الصندوق</th>
              <th className="p-3">المبلغ</th>
              <th className="p-3">سعر الصرف</th>
              <th className="p-3">NAV</th>
              <th className="p-3">الوثائق</th>
              <th className="p-3">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {deposits.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-600">
                  لسه مفيش إيداعات مسجلة
                </td>
              </tr>
            )}
            {[...deposits]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((d) => {
                const fund = fundById.get(d.fund_id);
                return (
                  <tr
                    key={d.id}
                    className="border-b border-zinc-800/60 last:border-0"
                  >
                    <td className="num p-3">{d.date}</td>
                    <td className="p-3">{fund?.name || '—'}</td>
                    <td className="num p-3 font-medium">
                      {fmtMoney(Number(d.amount), d.currency)}
                    </td>
                    <td className="num p-3">
                      {d.aed_egp_rate ? fmtNum(Number(d.aed_egp_rate), 2) : '—'}
                    </td>
                    <td className="num p-3">
                      {d.nav ? fmtNum(Number(d.nav), 4) : '—'}
                    </td>
                    <td className="num p-3">
                      {d.units ? fmtNum(Number(d.units), 2) : '—'}
                    </td>
                    <td className="p-3 text-zinc-400">{d.reason || '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
