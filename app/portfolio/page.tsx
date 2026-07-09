'use client';

import { useState } from 'react';
import { buildSummary } from '@/lib/calc';
import { fmtMoney, fmtNum, fmtPct, todayISO } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import { ASSET_CLASS_AR, COUNTRY_AR, type Fund } from '@/lib/types';
import { usePortfolioData } from '@/lib/usePortfolioData';

export default function PortfolioPage() {
  const { settings, funds, deposits, valuations, fx, loading, error, reload } =
    usePortfolioData();

  const [valuingFund, setValuingFund] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAddFund, setShowAddFund] = useState(false);
  const [fundForm, setFundForm] = useState({
    name: '',
    country: 'EG',
    platform: 'Thndr',
    asset_class: 'money_market',
  });

  if (loading)
    return <p className="py-20 text-center text-zinc-500">جاري التحميل…</p>;
  if (error)
    return <p className="py-20 text-center text-red-400">{error}</p>;

  const summary = buildSummary(funds, deposits, valuations, fx);

  // الوزن المستهدف لكل حيازة: وزن الدولة × وزن الفئة داخل مصر
  function targetWeight(fund: Fund): number | null {
    if (!settings) return null;
    if (fund.country === 'AE') return Number(settings.ae_target);
    const eg = Number(settings.eg_target);
    if (fund.asset_class === 'money_market')
      return eg * Number(settings.eg_money_market_target);
    if (fund.asset_class === 'equity')
      return eg * Number(settings.eg_equity_target);
    return eg;
  }

  async function saveValuation(fund: Fund) {
    const value = parseFloat(newValue);
    if (!value || value <= 0) return;
    setSaving(true);
    const { error } = await getSupabase().from('valuations').insert({
      fund_id: fund.id,
      date: todayISO(),
      current_value: value,
      currency: fund.country === 'EG' ? 'EGP' : 'AED',
    });
    setSaving(false);
    if (!error) {
      setValuingFund(null);
      setNewValue('');
      reload();
    }
  }

  async function deleteLastValuation(fundId: string, date: string) {
    if (
      !window.confirm(`متأكد إنك عايز تمسح تقييم يوم ${date} للصندوق ده؟`)
    )
      return;
    await getSupabase()
      .from('valuations')
      .delete()
      .eq('fund_id', fundId)
      .eq('date', date);
    reload();
  }

  async function toggleFund(fund: Fund) {
    await getSupabase()
      .from('funds')
      .update({ is_active: !fund.is_active })
      .eq('id', fund.id);
    reload();
  }

  async function addFund(e: React.FormEvent) {
    e.preventDefault();
    if (!fundForm.name.trim()) return;
    setSaving(true);
    const { error } = await getSupabase().from('funds').insert(fundForm);
    setSaving(false);
    if (!error) {
      setShowAddFund(false);
      setFundForm({
        name: '',
        country: 'EG',
        platform: 'Thndr',
        asset_class: 'money_market',
      });
      reload();
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">المحفظة</h1>

      {/* جدول الحيازات */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-right text-xs text-zinc-500">
              <th className="p-3">الصندوق</th>
              <th className="p-3">الدولة</th>
              <th className="p-3">المستثمَر</th>
              <th className="p-3">آخر قيمة</th>
              <th className="p-3">العائد %</th>
              <th className="p-3">الوزن الفعلي × المستهدف</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {summary.holdings.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-600">
                  لسه مفيش حيازات — سجّل أول إيداع من صفحة الإيداعات
                </td>
              </tr>
            )}
            {summary.holdings.map((h) => {
              const target = targetWeight(h.fund);
              const currency = h.fund.country === 'EG' ? 'EGP' : 'AED';
              return (
                <tr
                  key={h.fund.id}
                  className="border-b border-zinc-800/60 last:border-0"
                >
                  <td className="p-3">
                    <p className="font-medium">{h.fund.name}</p>
                    <p className="text-xs text-zinc-500">
                      {h.fund.platform} ·{' '}
                      {ASSET_CLASS_AR[h.fund.asset_class || ''] ||
                        h.fund.asset_class}
                    </p>
                  </td>
                  <td className="p-3">{COUNTRY_AR[h.fund.country]}</td>
                  <td className="num p-3">
                    {fmtMoney(h.investedNative, currency)}
                  </td>
                  <td className="p-3">
                    <span className="num">
                      {fmtMoney(h.currentNative, currency)}
                    </span>
                    {h.lastValuationDate && (
                      <p className="num text-xs text-zinc-600">
                        {h.lastValuationDate}
                      </p>
                    )}
                  </td>
                  <td
                    className={`num p-3 font-medium ${
                      (h.returnPct ?? 0) >= 0
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {fmtPct(h.returnPct)}
                  </td>
                  <td className="num p-3">
                    {fmtPct(h.weight)} × {target !== null ? fmtPct(target, 0) : '—'}
                  </td>
                  <td className="p-3">
                    {valuingFund === h.fund.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          dir="ltr"
                          autoFocus
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          placeholder={`القيمة بالـ ${currency}`}
                          className="w-28 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-amber-500"
                        />
                        <button
                          onClick={() => saveValuation(h.fund)}
                          disabled={saving}
                          className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-bold text-zinc-950 disabled:opacity-50"
                        >
                          حفظ
                        </button>
                        <button
                          onClick={() => setValuingFund(null)}
                          className="text-xs text-zinc-500"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setValuingFund(h.fund.id);
                            setNewValue('');
                          }}
                          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-amber-500 hover:text-amber-300"
                        >
                          تحديث قيمة
                        </button>
                        {h.lastValuationDate && (
                          <button
                            onClick={() =>
                              deleteLastValuation(
                                h.fund.id,
                                h.lastValuationDate!
                              )
                            }
                            title="مسح آخر تقييم (تراجع)"
                            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-red-600 hover:text-red-400"
                          >
                            ↩ مسح آخر قيمة
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* إدارة الصناديق */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-300">إدارة الصناديق</h2>
          <button
            onClick={() => setShowAddFund(!showAddFund)}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            {showAddFund ? 'إغلاق' : '+ إضافة صندوق'}
          </button>
        </div>

        {showAddFund && (
          <form
            onSubmit={addFund}
            className="mb-5 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-5"
          >
            <input
              value={fundForm.name}
              onChange={(e) =>
                setFundForm({ ...fundForm, name: e.target.value })
              }
              placeholder="اسم الصندوق"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-500 md:col-span-2"
            />
            <select
              value={fundForm.country}
              onChange={(e) =>
                setFundForm({
                  ...fundForm,
                  country: e.target.value,
                  platform: e.target.value === 'EG' ? 'Thndr' : 'Sarwa',
                })
              }
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none"
            >
              <option value="EG">مصر</option>
              <option value="AE">الإمارات</option>
            </select>
            <select
              value={fundForm.platform ?? ''}
              onChange={(e) =>
                setFundForm({ ...fundForm, platform: e.target.value })
              }
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none"
            >
              <option value="Thndr">Thndr</option>
              <option value="Sarwa">Sarwa</option>
              <option value="StashAway">StashAway</option>
            </select>
            <select
              value={fundForm.asset_class}
              onChange={(e) =>
                setFundForm({ ...fundForm, asset_class: e.target.value })
              }
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none"
            >
              {Object.entries(ASSET_CLASS_AR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50 md:col-span-5 md:w-32"
            >
              إضافة
            </button>
          </form>
        )}

        <ul className="divide-y divide-zinc-800/60">
          {funds.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2.5">
              <div>
                <span
                  className={f.is_active ? 'text-zinc-200' : 'text-zinc-600'}
                >
                  {f.name}
                </span>
                <span className="mr-2 text-xs text-zinc-500">
                  {COUNTRY_AR[f.country]} · {f.platform}
                </span>
              </div>
              <button
                onClick={() => toggleFund(f)}
                className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                  f.is_active
                    ? 'bg-emerald-900/40 text-emerald-300 hover:bg-red-900/40 hover:text-red-300'
                    : 'bg-zinc-800 text-zinc-500 hover:text-emerald-300'
                }`}
              >
                {f.is_active ? 'مفعّل' : 'معطّل'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
