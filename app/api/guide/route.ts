import { NextResponse } from 'next/server';
import { buildSummary, dStar, recommendAllocation } from '@/lib/calc';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { Deposit, Fund, FxRow, Settings, Valuation } from '@/lib/types';

export const dynamic = 'force-dynamic';

// تحليل الشهر — قرار محسوب بالكامل بالكود (بدون AI):
// أرقام ثابتة مضمونة + أسماء صناديق حقيقية من صناديق المستخدم المفعّلة

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'غير مسجّل دخول' }, { status: 401 });
  }

  const { amount, currency } = (await req.json()) as {
    amount?: number;
    currency?: 'EGP' | 'AED' | 'USD';
  };
  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0 || !currency) {
    return NextResponse.json({ error: 'مبلغ غير صالح' }, { status: 400 });
  }

  const [settingsRes, fundsRes, depositsRes, valuationsRes, fxRes] =
    await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('funds').select('*').order('name'),
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
  const egYield = Number(settings.expected_yield_eg);
  const aeYield = Number(settings.expected_yield_ae);

  const budgetAED =
    currency === 'AED'
      ? amountNum
      : currency === 'EGP'
        ? amountNum / summary.fxRate
        : amountNum * 3.6725;

  const rec = recommendAllocation(budgetAED, summary, settings, funds);
  const active = funds.filter((f) => f.is_active);
  const egAvailable = active.some((f) => f.country === 'EG');
  const aeAvailable = active.some((f) => f.country === 'AE');

  // ربط كل بند بصندوق حقيقي بالاسم من صناديق المستخدم المفعّلة
  const decision = rec.lines.map((l) => {
    const fund =
      active.find(
        (f) =>
          f.country === l.country &&
          (!l.assetClass || f.asset_class === l.assetClass)
      ) || active.find((f) => f.country === l.country);
    const isEG = l.country === 'EG';
    const amountNative = isEG ? l.amountAED * summary.fxRate : l.amountAED;
    return {
      fundName: fund?.name ?? l.label,
      platform: fund?.platform ?? (isEG ? 'Thndr' : 'Sarwa'),
      country: l.country,
      amountNative: Math.round(amountNative),
      currencyLabel: isEG ? 'جنيه' : 'درهم',
      amountAED: Math.round(l.amountAED),
    };
  });

  // أسباب القرار — مبنية بالكود، مش بالـ AI
  const why: string[] = [];
  const egPct = (egYield * 100).toFixed(0);
  const aePct = (aeYield * 100).toFixed(0);
  const dPct = (d * 100).toFixed(1);
  const allEG = decision.every((l) => l.country === 'EG');

  if (allEG) {
    why.push(
      `العائد المتوقع في صناديق مصر النقدية حوالي ${egPct}% سنويًا بالجنيه — مقابل حوالي ${aePct}% بس بالدرهم في الإمارات.`
    );
    why.push(
      `الإمارات متكسبش أكتر من مصر إلا لو الجنيه اتخفض أكتر من ${dPct}% في سنة واحدة — وطول ما التوقع أقل من كده، مصر بتكسب.`
    );
  }
  if (budgetAED < 500) {
    why.push(
      'مبلغك الشهري لسه صغير (أقل من 500 درهم) — التركيز في صندوق واحد أأمن وأبسط من التشتيت، ورسوم تحويل أي جزء منه للخارج هتاكل منه نسبة كبيرة.'
    );
  }
  for (const r of rec.rationale) {
    if (!why.includes(r)) why.push(r);
  }

  // خطوات التنفيذ — حسب منصة كل بند
  const steps: string[] = [];
  for (const line of decision) {
    if (line.platform === 'Thndr') {
      steps.push(
        `افتح تطبيق ثاندر → قسم «صناديق الاستثمار» → دوّر على «${line.fundName}» → اشتري وثائق بمبلغ ${line.amountNative.toLocaleString('en-US')} ${line.currencyLabel}.`
      );
    } else {
      steps.push(
        `افتح تطبيق ${line.platform} → حوّل ${line.amountNative.toLocaleString('en-US')} ${line.currencyLabel} لمحفظتك المُدارة «${line.fundName}».`
      );
    }
  }
  steps.push(
    'بعد ما تنفذ، ارجع هنا وسجّل الإيداع (من صفحة الإيداعات أو قول للمستشار في الشات) عشان يتحسب في محفظتك.'
  );

  return NextResponse.json({
    decision,
    why,
    steps,
    comparison: {
      egYieldPct: egPct,
      aeYieldPct: aePct,
      breakevenPct: dPct,
      egAvailable,
      aeAvailable,
      fxRate: Number(summary.fxRate.toFixed(2)),
      budgetAED: Math.round(budgetAED),
    },
    dStar: d,
  });
}
