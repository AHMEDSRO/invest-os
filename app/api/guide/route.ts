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

  // نحدد الصناديق بالاسم هنا في السيرفر — الـ AI بيصيغ بس، مش بيقرر
  const suggestions = rec.lines.map((l) => {
    const fund =
      funds.find(
        (f) =>
          f.is_active &&
          f.country === l.country &&
          (!l.assetClass || f.asset_class === l.assetClass)
      ) || funds.find((f) => f.is_active && f.country === l.country);
    const isEG = l.country === 'EG';
    const amountNative = isEG ? l.amountAED * summary.fxRate : l.amountAED;
    return fund
      ? `«${fund.name}» على منصة ${fund.platform} — بمبلغ ${Math.round(amountNative)} ${isEG ? 'جنيه' : 'درهم'}`
      : `${l.label} — بمبلغ ${Math.round(l.amountAED)} درهم`;
  });

  const userAmountLabel = `${amountNum} ${
    currency === 'EGP' ? 'جنيه' : currency === 'AED' ? 'درهم' : 'دولار'
  }`;

  const guidePrompt = `أنت مرشد استثماري شخصي لأحمد — مستثمر مبتدئ بيدوّر على أضمن اختيار لفلوسه. اعتمد على المعلومات دي فقط وممنوع تخترع أي رقم أو صندوق من عندك:

- ميزانية الشهر: ${userAmountLabel} (تساوي تقريبًا ${budgetAED.toFixed(0)} درهم بسعر ${summary.fxRate.toFixed(2)} جنيه للدرهم)
- القرار المحسوب (اتحدد بالفعل — مهمتك تشرحه مش تغيّره): ${suggestions.join(' + ')}
- العائد السنوي المتوقع: صناديق مصر حوالي ${(Number(settings.expected_yield_eg) * 100).toFixed(0)}% بالجنيه × صناديق الإمارات حوالي ${(Number(settings.expected_yield_ae) * 100).toFixed(0)}% بالدرهم
- حساب التعادل: مصر بتكسب أكتر طالما الجنيه مش هيتخفض أكتر من ${(d * 100).toFixed(1)}% في السنة
- سبب القرار من المحرك الحسابي: ${rec.rationale.join(' | ')}

قواعد إلزامية للرد:
- اكتب بالمصري البسيط جدًا، نص عادي تمامًا من غير أي تنسيق: ممنوع النجوم ** وممنوع markdown وممنوع عناوين بالرموز.
- اتكلم بعملة أحمد الأساسية (${userAmountLabel}) — والدرهم يتقال كمعلومة إضافية لو محتاج.
- ممنوع مصطلحات معقدة (زي d* أو أوزان أو تعرّض) — ولو لزم مصطلح فسّره بين قوسين.

اكتب الرد بالهيكل ده بالظبط:
السطر الأول: "القرار: استثمر [المبلغ] في [اسم الصندوق بالظبط] على [المنصة]" — لو القرار مقسوم على أكتر من صندوق اذكرهم كلهم بالمبالغ.
بعدين سطر "ليه ده أضمن اختيار؟" وتحته 3 نقط قصيرة بأرقام بسيطة، كل نقطة تبدأ بشرطة -
بعدين سطر "تنفذها إزاي؟" وتحته خطوتين أو تلاتة عمليين بالظبط على المنصة المذكورة، كل خطوة تبدأ بشرطة -
وآخر سطر: تذكير لطيف قصير إنك مش مستشار مالي مرخّص والقرار النهائي له.
${budgetAED < 500 ? 'المبلغ أقل من 500 درهم: أكد إن التركيز في وجهة واحدة أأمن من التشتيت، وإن تحويل مبلغ صغير زي ده للخارج رسوم التحويل هتاكل منه جزء كبير.' : ''}`;

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
