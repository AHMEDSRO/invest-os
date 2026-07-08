import { NextResponse } from 'next/server';
import { buildSummary, dStar, recommendAllocation } from '@/lib/calc';
import { chatCompletion } from '@/lib/llm';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { Deposit, Fund, FxRow, Settings, Valuation } from '@/lib/types';

export const dynamic = 'force-dynamic';

// حد بسيط: 10 استشارات/ساعة
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
let hits: number[] = [];

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'غير مسجّل دخول' }, { status: 401 });
  }

  const now = Date.now();
  hits = hits.filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'وصلت لحد الاستشارات المؤقت — جرب بعد شوية' },
      { status: 429 }
    );
  }

  const { amount, currency } = (await req.json()) as {
    amount?: number;
    currency?: 'EGP' | 'AED' | 'USD';
  };
  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0 || !currency) {
    return NextResponse.json({ error: 'مبلغ غير صالح' }, { status: 400 });
  }
  hits.push(now);

  const [settingsRes, fundsRes, depositsRes, valuationsRes, fxRes] =
    await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('funds').select('*'),
      supabase.from('deposits').select('*').order('date', { ascending: true }),
      supabase.from('valuations').select('*'),
      supabase
        .from('fx_history')
        .select('*')
        .order('date', { ascending: true }),
    ]);

  const settings = settingsRes.data as Settings | null;
  if (!settings) {
    return NextResponse.json(
      { error: 'الإعدادات غير موجودة' },
      { status: 500 }
    );
  }
  const funds = (fundsRes.data as Fund[]) ?? [];
  const deposits = (depositsRes.data as Deposit[]) ?? [];
  const valuations = (valuationsRes.data as Valuation[]) ?? [];
  const fx = (fxRes.data as FxRow[]) ?? [];

  const summary = buildSummary(funds, deposits, valuations, fx);
  const d = dStar(settings);

  // تحويل الميزانية للدرهم (الدرهم مثبّت للدولار عند 3.6725)
  const budgetAED =
    currency === 'AED'
      ? amountNum
      : currency === 'EGP'
        ? amountNum / summary.fxRate
        : amountNum * 3.6725;

  const rec = recommendAllocation(budgetAED, summary, settings);

  const activeFunds = funds
    .filter((f) => f.is_active)
    .map((f) => `${f.name} (${f.country === 'EG' ? 'مصر' : 'الإمارات'} — ${f.platform})`);

  const guidePrompt = `أنت مرشد استثماري شخصي لأحمد — مستثمر مبتدئ بيدوّر على أضمن اختيار لفلوسه. اعتمد على الأرقام دي فقط وممنوع تخترع أي رقم من عندك:

- ميزانية الشهر: ${amountNum} ${currency} (تساوي تقريبًا ${budgetAED.toFixed(0)} درهم بسعر ${summary.fxRate.toFixed(2)} جنيه للدرهم)
- العائد السنوي المتوقع: مصر ${(Number(settings.expected_yield_eg) * 100).toFixed(0)}% × الإمارات ${(Number(settings.expected_yield_ae) * 100).toFixed(0)}%
- نقطة التعادل: مصر تكسب طالما تخفيض الجنيه المتوقع أقل من ${(d * 100).toFixed(1)}% سنويًا
- محفظته الحالية: مصر ${(summary.egWeight * 100).toFixed(0)}% (هدفه ${(Number(settings.eg_target) * 100).toFixed(0)}%) — الإمارات ${(summary.aeWeight * 100).toFixed(0)}% (هدفه ${(Number(settings.ae_target) * 100).toFixed(0)}%)
- توصية المحرك الحسابي للتوزيع: ${rec.lines.map((l) => `${l.label}: ${l.amountAED.toFixed(0)} درهم`).join(' + ') || 'لا يوجد'}
- ملاحظات المحرك: ${rec.rationale.join(' | ')}
- الصناديق المتاحة عنده: ${activeFunds.join(' — ')}

اكتب له إجابة قصيرة بالمصري البسيط جدًا (من غير مصطلحات زي d* أو أوزان):
1) سطر واحد جريء: القرار المقترح — يحط المبلغ فين بالظبط
2) «ليه ده أضمن اختيار؟» — 3 نقط قصيرة بأرقام بسيطة
3) «تنفذها إزاي؟» — خطوتين عمليتين على التطبيق المناسب (ثاندر أو Sarwa)
4) سطر أخير: تذكير لطيف إنك مش مستشار مالي مرخّص والقرار النهائي ليه
لو المبلغ أقل من 500 درهم شدد إن وجهة واحدة أفضل من التشتيت. لو تحويل المبلغ للخارج هياكل رسوم كبيرة بالنسبة لحجمه، اذكر ده.`;

  let answer: string;
  try {
    answer = await chatCompletion(guidePrompt, [
      { role: 'user', content: 'معايا المبلغ ده الشهر — أحطه فين؟' },
    ]);
  } catch (err) {
    return NextResponse.json(
      {
        error: `المرشد مش قادر يرد دلوقتي: ${
          err instanceof Error ? err.message : 'خطأ غير معروف'
        }`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    answer,
    dStar: d,
    budgetAED,
    lines: rec.lines,
  });
}
