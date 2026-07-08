'use client';

import { useState } from 'react';
import { currentMonth } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';

type Currency = 'EGP' | 'AED' | 'USD';

// «سؤال الشهر» — قلب التطبيق للمستثمر المبتدئ:
// معايا مبلغ، أحطه فين؟ + إيه أخبار السوق؟
export default function GuideCard() {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [answer, setAnswer] = useState<string | null>(null);
  const [dStarValue, setDStarValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0 || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSaved(false);
    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, currency }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'حصل خطأ — حاول تاني');
      else {
        setAnswer(data.answer);
        setDStarValue(data.dStar ?? null);
      }
    } catch {
      setError('مشكلة في الاتصال — حاول تاني');
    }
    setLoading(false);
  }

  async function saveDecision() {
    if (!answer || saved) return;
    const { error } = await getSupabase().from('monthly_reviews').insert({
      month: currentMonth(),
      market_summary: null,
      decision: `ميزانية ${amount} ${currency} — رأي المرشد:\n${answer}`,
      d_star: dStarValue,
    });
    if (!error) setSaved(true);
  }

  async function loadBrief() {
    if (briefLoading) return;
    setBriefLoading(true);
    setBrief(null);
    try {
      const res = await fetch('/api/market-brief');
      const data = await res.json();
      setBrief(res.ok ? data.brief : data.error || 'حصل خطأ');
    } catch {
      setBrief('مشكلة في الاتصال — حاول تاني');
    }
    setBriefLoading(false);
  }

  return (
    <div className="rounded-2xl border border-amber-600/40 bg-gradient-to-l from-zinc-900 via-zinc-900 to-amber-950/40 p-5 md:p-6">
      <h2 className="text-base font-bold text-amber-300 md:text-lg">
        💰 معايا مبلغ الشهر ده — أستثمره فين؟
      </h2>
      <p className="mt-1 text-xs text-zinc-400">
        اكتب المبلغ بأي عملة والمرشد يحددلك السوق والصندوق بالاسم وليه وإزاي
        تنفذ
      </p>

      <form onSubmit={ask} className="mt-4 flex flex-wrap gap-2">
        <input
          type="number"
          step="any"
          dir="ltr"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1000"
          className="w-32 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm outline-none focus:border-amber-500 md:flex-none md:basis-40"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
        >
          <option value="EGP">جنيه EGP</option>
          <option value="AED">درهم AED</option>
          <option value="USD">دولار USD</option>
        </select>
        <button
          type="submit"
          disabled={loading || !parseFloat(amount)}
          className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          {loading ? 'بيفكرلك…' : 'قولي أستثمر فين'}
        </button>
        <button
          type="button"
          onClick={loadBrief}
          disabled={briefLoading}
          className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:border-amber-500 hover:text-amber-300 disabled:opacity-40"
        >
          {briefLoading ? 'بيقرا الأخبار…' : '🗞️ إيه أخبار السوق؟'}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {answer && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
            {answer}
          </p>
          <button
            onClick={saveDecision}
            disabled={saved}
            className="mt-3 rounded-lg border border-amber-600/50 px-4 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500 hover:text-zinc-950 disabled:opacity-60"
          >
            {saved ? 'اتحفظ كقرار الشهر ✓' : 'احفظه كقرار الشهر'}
          </button>
        </div>
      )}

      {brief && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <p className="mb-2 text-xs font-bold text-amber-300">
            🗞️ موجز السوق (بيتحدث كل 6 ساعات)
          </p>
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
            {brief}
          </p>
        </div>
      )}
    </div>
  );
}
