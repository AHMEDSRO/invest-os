'use client';

import { useState } from 'react';
import { currentMonth, fmtNum } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';

type Currency = 'EGP' | 'AED' | 'USD';
type Market = 'AUTO' | 'EG' | 'AE';

type DecisionLine = {
  fundName: string;
  platform: string;
  country: 'EG' | 'AE';
  amountNative: number;
  currencyLabel: string;
  amountAED: number;
  afterYearNative: number;
  hypothetical?: boolean;
};

type Analysis = {
  decision: DecisionLine[];
  why: string[];
  steps: string[];
  comparison: {
    egYieldPct: string;
    aeYieldPct: string;
    breakevenPct: string;
    egAvailable: boolean;
    aeAvailable: boolean;
    fxRate: number;
    budgetAED: number;
  };
  dStar: number;
};

// «تحليل الشهر» — قرار محسوب بالكود بأسماء صناديق حقيقية، مش شات
export default function GuideCard() {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [market, setMarket] = useState<Market>('AUTO');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
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
    setAnalysis(null);
    setSaved(false);
    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, currency, market }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'حصل خطأ — حاول تاني');
      else setAnalysis(data);
    } catch {
      setError('مشكلة في الاتصال — حاول تاني');
    }
    setLoading(false);
  }

  async function saveDecision() {
    if (!analysis || saved) return;
    const decisionText = analysis.decision
      .map(
        (l) =>
          `- ${fmtNum(l.amountNative)} ${l.currencyLabel} في «${l.fundName}» على ${l.platform}`
      )
      .join('\n');
    const { error } = await getSupabase().from('monthly_reviews').insert({
      month: currentMonth(),
      market_summary: null,
      decision: `ميزانية ${amount} ${currency}:\n${decisionText}`,
      d_star: analysis.dStar,
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
        تحليل محسوب بأرقامك، بيحددلك الصندوق بالاسم من صناديقك المفعّلة في
        المحفظة
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
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as Market)}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
        >
          <option value="AUTO">🎯 الأنسب ليا</option>
          <option value="EG">🇪🇬 مصر بس</option>
          <option value="AE">🇦🇪 الإمارات بس</option>
        </select>
        <button
          type="submit"
          disabled={loading || !parseFloat(amount)}
          className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          {loading ? 'بيحسب…' : 'قولي أستثمر فين'}
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

      {analysis && (
        <div className="mt-4 space-y-3">
          {/* القرار */}
          <div className="rounded-xl border border-amber-500/60 bg-zinc-950/80 p-4">
            <p className="mb-2 text-xs font-bold text-amber-400">
              ✅ قرار الشهر المقترح
            </p>
            {analysis.decision.length === 0 ? (
              <p className="text-sm text-zinc-400">
                مفيش صناديق مفعّلة — فعّل صناديقك من صفحة المحفظة الأول
              </p>
            ) : (
              <ul className="space-y-3">
                {analysis.decision.map((l, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-zinc-100">
                        «{l.fundName}»
                        <span className="mr-2 text-xs font-normal text-zinc-500">
                          على {l.platform}
                        </span>
                        {l.hypothetical && (
                          <span className="mr-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            توضيحي
                          </span>
                        )}
                      </span>
                      <span className="num text-base font-black text-amber-300">
                        {fmtNum(l.amountNative)} {l.currencyLabel}
                      </span>
                    </div>
                    <p className="num mt-0.5 text-xs text-emerald-400/80">
                      بعد سنة بالعائد المتوقع: ~{fmtNum(l.afterYearNative)}{' '}
                      {l.currencyLabel}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ليه؟ */}
          {analysis.why.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="mb-2 text-xs font-bold text-zinc-300">
                ليه ده أضمن اختيار؟
              </p>
              <ul className="space-y-1.5">
                {analysis.why.map((w, i) => (
                  <li key={i} className="text-sm leading-6 text-zinc-300">
                    • {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* الخطوات */}
          {analysis.steps.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="mb-2 text-xs font-bold text-zinc-300">
                تنفذها إزاي؟
              </p>
              <ol className="space-y-1.5">
                {analysis.steps.map((s, i) => (
                  <li key={i} className="text-sm leading-6 text-zinc-300">
                    <span className="num font-bold text-amber-400">
                      {i + 1}.
                    </span>{' '}
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={saveDecision}
              disabled={saved || analysis.decision.length === 0}
              className="rounded-lg border border-amber-600/50 px-4 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500 hover:text-zinc-950 disabled:opacity-60"
            >
              {saved ? 'اتحفظ كقرار الشهر ✓' : 'احفظه كقرار الشهر'}
            </button>
            <p className="text-[11px] text-zinc-600">
              تحليل آلي بأرقام استراتيجيتك — مش نصيحة مالية مرخّصة، والقرار
              النهائي ليك
            </p>
          </div>
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
