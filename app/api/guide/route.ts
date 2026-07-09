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

  const { amount, currency, market } = (await req.json()) as {
    amount?: number;
    currency?: 'EGP' | 'AED' | 'USD';
    market?: 'AUTO' | 'EG' | 'AE';
  };
  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0 || !currency) {
    return NextResponse.json({ error: 'مبلغ غير صالح' }, { status: 400 });
  }
  const marketChoice: 'AUTO' | 'EG' | 'AE' =
    market === 'EG' || market === 'AE' ? market : 'AUTO';

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

  // لو المستخدم اختار سوق معين، التحليل يتحصر فيه
  const fundsForRec =
    marketChoice === 'AUTO'
      ? funds
      : funds.filter((f) => f.country === marketChoice);

  const rec = recommendAllocation(budgetAED, summary, settings, fundsForRec);
  const active = fundsForRec.filter((f) => f.is_active);
  const egAvailable = funds.some((f) => f.is_active && f.country === 'EG');
  const aeAvailable = funds.some((f) => f.is_active && f.country === 'AE');

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

  // ربط كل بند بصندوق حقيقي بالاسم من صناديق المستخدم المفعّلة
  let decision: DecisionLine[] = rec.lines.map((l) => {
    const fund =
      active.find(
        (f) =>
          f.country === l.country &&
          (!l.assetClass || f.asset_class === l.assetClass)
      ) || active.find((f) => f.country === l.country);
    const isEG = l.country === 'EG';
    const amountNative = isEG ? l.amountAED * summary.fxRate : l.amountAED;
    const yieldRate = isEG ? egYield : aeYield;
    return {
      fundName: fund?.name ?? l.label,
      platform: fund?.platform ?? (isEG ? 'Thndr' : 'Sarwa'),
      country: l.country,
      amountNative: Math.round(amountNative),
      currencyLabel: isEG ? 'جنيه' : 'درهم',
      amountAED: Math.round(l.amountAED),
      afterYearNative: Math.round(amountNative * (1 + yieldRate)),
    };
  });

  // اختار الإمارات وهو لسه مفتحش حساب هناك → عرض توضيحي واضح
  let hypotheticalAE = false;
  if (marketChoice === 'AE' && decision.length === 0) {
    hypotheticalAE = true;
    decision = [
      {
        fundName: 'محفظة مُدارة (مثال: Sarwa) — محتاج تفتح حساب الأول',
        platform: 'Sarwa',
        country: 'AE',
        amountNative: Math.round(budgetAED),
        currencyLabel: 'درهم',
        amountAED: Math.round(budgetAED),
        afterYearNative: Math.round(budgetAED * (1 + aeYield)),
        hypothetical: true,
      },
    ];
  }

  // أسباب القرار — مبنية بالكود، مش بالـ AI
  const why: string[] = [];
  const egPct = (egYield * 100).toFixed(0);
  const aePct = (aeYield * 100).toFixed(0);
  const dPct = (d * 100).toFixed(1);
  const allEG = decision.every((l) => l.country === 'EG');

  if (marketChoice === 'EG') {
    why.push(
      `ده ملخص السوق المصري اللي اخترته: العائد المتوقع في الصناديق النقدية حوالي ${egPct}% سنويًا بالجنيه — من غير أي رسوم تحويل عملة.`
    );
    why.push(
      `للمقارنة: الإمارات متكسبش أكتر من مصر إلا لو الجنيه اتخفض أكتر من ${dPct}% في سنة واحدة.`
    );
  } else if (marketChoice === 'AE') {
    why.push(
      `ده ملخص سوق الإمارات اللي اخترته: العائد المتوقع حوالي ${aePct}% سنويًا بالدرهم — أقل من مصر، لكن بعملة مستقرة مربوطة بالدولار (حماية كاملة من تخفيض الجنيه).`
    );
    why.push(
      `الإمارات بتكسب أكتر من مصر بس لو الجنيه اتخفض أكتر من ${dPct}% في سنة واحدة.`
    );
    if (currency === 'EGP') {
      why.push(
        'انتبه: تحويل مبلغ بالجنيه للإمارات عليه رسوم تحويل وفرق سعر صرف — بياكلوا نسبة ملحوظة من المبالغ الصغيرة.'
      );
    }
    if (hypotheticalAE) {
      why.push(
        'ده عرض توضيحي بس — مفيش عندك حساب إماراتي مفعّل حاليًا. لو قررت تدخل الإمارات فعلًا، افتح حساب Sarwa الأول وضيف المحفظة من صفحة المحفظة.'
      );
    }
  } else if (allEG) {
    why.push(
      `العائد المتوقع في صناديق مصر النقدية حوالي ${egPct}% سنويًا بالجنيه — مقابل حوالي ${aePct}% بس بالدرهم في الإمارات.`
    );
    why.push(
      `الإمارات متكسبش أكتر من مصر إلا لو الجنيه اتخفض أكتر من ${dPct}% في سنة واحدة — وطول ما التوقع أقل من كده، مصر بتكسب.`
    );
  }
  if (budgetAED < 500 && !hypotheticalAE) {
    why.push(
      'مبلغك الشهري لسه صغير (أقل من 500 درهم) — التركيز في صندوق واحد أأمن وأبسط من التشتيت، ورسوم تحويل أي جزء منه للخارج هتاكل منه نسبة كبيرة.'
    );
  }
  for (const r of rec.rationale) {
    if (!why.includes(r) && !hypotheticalAE) why.push(r);
  }

  // خطوات التنفيذ — حسب منصة كل بند
  const steps: string[] = [];
  if (hypotheticalAE) {
    steps.push(
      'افتح حساب على Sarwa (أو StashAway) — التسجيل أونلاين وبيحتاج إثبات هوية وإقامة.'
    );
    steps.push(
      'بعد ما الحساب يتفعّل، ضيف المحفظة هنا من صفحة «المحفظة → + إضافة صندوق» — وساعتها التحليل هيحسبهالك بجد.'
    );
  } else {
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
  }

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
