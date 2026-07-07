'use client';

import { useEffect, useState } from 'react';
import { buildSummary, dStar, recommendAllocation } from '@/lib/calc';
import { currentMonth, fmtAED, fmtNum, fmtPct } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import { usePortfolioData } from '@/lib/usePortfolioData';

type BudgetCurrency = 'AED' | 'EGP' | 'USD';

export default function SessionPage() {
  const { settings, funds, deposits, valuations, fx, loading, error } =
    usePortfolioData();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [month, setMonth] = useState(currentMonth());
  const [budget, setBudget] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState<BudgetCurrency>('AED');
  const [liveRates, setLiveRates] = useState<{
    egpPerAed: number;
    usdPerAed: number;
  } | null>(null);
  const [cbRate, setCbRate] = useState('');
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // أسعار الصرف الحية لتحويل الميزانية من أي عملة للدرهم
  useEffect(() => {
    let cancelled = false;
    fetch('https://open.er-api.com/v6/latest/AED')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.rates?.EGP && data?.rates?.USD) {
          setLiveRates({
            egpPerAed: Number(data.rates.EGP),
            usdPerAed: Number(data.rates.USD),
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading)
    return <p className="py-20 text-center text-zinc-500">جاري التحميل…</p>;
  if (error)
    return <p className="py-20 text-center text-red-400">{error}</p>;
  if (!settings)
    return (
      <p className="py-20 text-center text-red-400">
        الإعدادات غير موجودة — اتأكد إن الـ migration اتنفذ
      </p>
    );

  const summary = buildSummary(funds, deposits, valuations, fx);
  const d = dStar(settings);

  // تحويل الميزانية للدرهم مهما كانت العملة المدخلة
  const egpPerAed = liveRates?.egpPerAed ?? summary.fxRate;
  const usdPerAed = liveRates?.usdPerAed ?? 0.2723; // الدرهم مثبّت للدولار
  const amountNum = parseFloat(budget) || 0;
  const budgetAED =
    budgetCurrency === 'AED'
      ? amountNum
      : budgetCurrency === 'EGP'
        ? amountNum / egpPerAed
        : amountNum / usdPerAed;

  const rec = recommendAllocation(budgetAED, summary, settings);

  function goToStep2() {
    if (budgetAED > 0) setStep(2);
  }

  function goToStep3() {
    // تجهيز نص القرار من التوصية — قابل للتعديل قبل الحفظ
    const lines = rec.lines
      .map(
        (l) =>
          `- ${l.label}: ${fmtNum(l.amountAED)} AED${
            l.country === 'EG'
              ? ` (≈ ${fmtNum(l.amountAED * summary.fxRate)} EGP)`
              : ''
          }`
      )
      .join('\n');
    const budgetLabel =
      budgetCurrency === 'AED'
        ? `${fmtNum(budgetAED)} AED`
        : `${fmtNum(amountNum)} ${budgetCurrency} (≈ ${fmtNum(budgetAED)} AED)`;
    setDecision(`ميزانية ${month}: ${budgetLabel}\nالتوزيع:\n${lines}`);
    setStep(3);
  }

  async function saveReview() {
    setSaving(true);
    const marketSummary = [
      cbRate ? `فائدة المركزي: ${cbRate}%` : null,
      notes || null,
    ]
      .filter(Boolean)
      .join(' — ');

    const { error } = await getSupabase().from('monthly_reviews').insert({
      month,
      market_summary: marketSummary || null,
      decision,
      d_star: d,
    });
    setSaving(false);
    if (!error) setSaved(true);
  }

  const stepTitles = ['بيانات الشهر', 'التوصية', 'حفظ القرار'];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">الجلسة الشهرية</h1>

      {/* مؤشر الخطوات */}
      <div className="flex items-center gap-2">
        {stepTitles.map((title, i) => (
          <div key={i} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step > i
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`hidden text-sm sm:inline ${
                step > i ? 'text-zinc-200' : 'text-zinc-600'
              }`}
            >
              {title}
            </span>
          </div>
        ))}
      </div>

      {/* الخطوة 1: الميزانية وبيانات السوق */}
      {step === 1 && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">الشهر</label>
            <input
              type="month"
              dir="ltr"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              ميزانية الشهر — بأي عملة وإحنا نحوّلها
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                dir="ltr"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
              <select
                value={budgetCurrency}
                onChange={(e) =>
                  setBudgetCurrency(e.target.value as BudgetCurrency)
                }
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
              >
                <option value="AED">درهم AED</option>
                <option value="EGP">جنيه EGP</option>
                <option value="USD">دولار USD</option>
              </select>
            </div>
            {budgetCurrency !== 'AED' && amountNum > 0 && (
              <p className="num mt-1.5 text-xs text-amber-300/80">
                ≈ {fmtNum(budgetAED)} AED بسعر اليوم
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              فائدة المركزي المصري % (اختياري)
            </label>
            <input
              type="number"
              step="any"
              dir="ltr"
              value={cbRate}
              onChange={(e) => setCbRate(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              ملاحظات عن السوق (EGX30، الجنيه، أخبار…)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <button
            onClick={goToStep2}
            disabled={budgetAED <= 0}
            className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            التالي ←
          </button>
        </div>
      )}

      {/* الخطوة 2: الحسابات والتوصية */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-600/40 bg-amber-950/20 p-5">
            <p className="text-sm text-amber-300/80">نقطة التعادل</p>
            <p className="num mt-1 text-3xl font-black text-amber-400">
              d* = {fmtPct(d)}
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              مصر تكسب طالما تخفيض الجنيه المتوقع أقل من{' '}
              <span className="num font-bold">{fmtPct(d)}</span> سنويًا.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              الانحراف عن الأوزان المستهدفة
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                مصر: <span className="num">{fmtPct(summary.egWeight)}</span>{' '}
                فعلي ×{' '}
                <span className="num">
                  {fmtPct(Number(settings.eg_target), 0)}
                </span>{' '}
                مستهدف{' '}
                <span
                  className={`num ${
                    summary.egWeight < Number(settings.eg_target)
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  ({fmtPct(summary.egWeight - Number(settings.eg_target))})
                </span>
              </p>
              <p>
                الإمارات:{' '}
                <span className="num">{fmtPct(summary.aeWeight)}</span> فعلي ×{' '}
                <span className="num">
                  {fmtPct(Number(settings.ae_target), 0)}
                </span>{' '}
                مستهدف{' '}
                <span
                  className={`num ${
                    summary.aeWeight < Number(settings.ae_target)
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  ({fmtPct(summary.aeWeight - Number(settings.ae_target))})
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              التوصية المقترحة — ميزانية {fmtAED(budgetAED)}
            </h2>
            {rec.lines.length === 0 ? (
              <p className="text-sm text-zinc-500">مفيش توصية — راجع الأرقام</p>
            ) : (
              <ul className="space-y-2">
                {rec.lines.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-zinc-950 px-4 py-2.5 text-sm"
                  >
                    <span>{l.label}</span>
                    <span className="num font-bold text-amber-300">
                      {fmtAED(l.amountAED)}
                      {l.country === 'EG' && (
                        <span className="mr-2 text-xs text-zinc-500">
                          ≈ {fmtNum(l.amountAED * summary.fxRate)} EGP
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-4 space-y-1">
              {rec.rationale.map((r, i) => (
                <li key={i} className="text-xs leading-5 text-zinc-500">
                  • {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300"
            >
              → رجوع
            </button>
            <button
              onClick={goToStep3}
              className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400"
            >
              التالي ←
            </button>
          </div>
        </div>
      )}

      {/* الخطوة 3: حفظ القرار */}
      {step === 3 && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              قرار الشهر وسببه (تقدر تعدّل قبل الحفظ)
            </label>
            <textarea
              rows={7}
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500"
            />
          </div>

          {saved ? (
            <p className="text-sm font-medium text-emerald-400">
              الجلسة اتحفظت ✓ — سجّل الإيداعات الفعلية من صفحة الإيداعات
            </p>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300"
              >
                → رجوع
              </button>
              <button
                onClick={saveReview}
                disabled={saving || !decision.trim()}
                className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ…' : 'حفظ الجلسة'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
