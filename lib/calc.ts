import type {
  Deposit,
  Fund,
  FxRow,
  Settings,
  Valuation,
} from './types';

// نقطة التعادل: d* = 1 − (1+r_ae)/(1+r_eg)
// مصر تكسب طالما تخفيض الجنيه المتوقع سنويًا أقل من d*
export function dStar(settings: Settings): number {
  return (
    1 -
    (1 + Number(settings.expected_yield_ae)) /
      (1 + Number(settings.expected_yield_eg))
  );
}

// آخر سعر AED/EGP: من fx_history، وإلا من آخر إيداع مسجّل له سعر
export function latestFxRate(fx: FxRow[], deposits: Deposit[]): number {
  if (fx.length > 0) {
    const sorted = [...fx].sort((a, b) => a.date.localeCompare(b.date));
    return Number(sorted[sorted.length - 1].aed_egp);
  }
  const withRate = deposits
    .filter((d) => d.aed_egp_rate)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (withRate.length > 0)
    return Number(withRate[withRate.length - 1].aed_egp_rate);
  return 13; // fallback تقريبي لحين تسجيل أول سعر
}

export function toAED(amount: number, currency: string, rate: number): number {
  return currency === 'EGP' ? amount / rate : amount;
}

export type Holding = {
  fund: Fund;
  investedNative: number; // بعملة الصندوق
  investedAED: number; // محوّل بسعر يوم كل إيداع (يشمل أثر العملة)
  currentNative: number;
  currentAED: number; // محوّل بآخر سعر
  returnPct: number | null; // بالدرهم — شامل أثر العملة
  weight: number; // الوزن الفعلي في المحفظة
  lastValuationDate: string | null;
};

export type MonthlyDepositRow = { month: string; EG: number; AE: number };

export type PortfolioSummary = {
  holdings: Holding[];
  totalInvestedAED: number;
  totalValueAED: number;
  totalReturnPct: number | null;
  egValueAED: number;
  aeValueAED: number;
  egWeight: number;
  aeWeight: number;
  egByClassAED: Record<string, number>; // تقسيمة الأصول داخل مصر
  fxRate: number;
  dcaStreak: number;
  monthlyDeposits: MonthlyDepositRow[];
};

export function buildSummary(
  funds: Fund[],
  deposits: Deposit[],
  valuations: Valuation[],
  fx: FxRow[],
  now: Date = new Date()
): PortfolioSummary {
  const fxRate = latestFxRate(fx, deposits);

  // آخر تقييم لكل صندوق
  const latestValuation = new Map<string, Valuation>();
  for (const v of valuations) {
    const prev = latestValuation.get(v.fund_id);
    if (!prev || v.date > prev.date) latestValuation.set(v.fund_id, v);
  }

  const holdings: Holding[] = [];
  for (const fund of funds) {
    const fundDeposits = deposits.filter((d) => d.fund_id === fund.id);
    if (fundDeposits.length === 0 && !latestValuation.has(fund.id)) continue;

    let investedNative = 0;
    let investedAED = 0;
    for (const d of fundDeposits) {
      const amount = Number(d.amount);
      investedNative += amount;
      if (d.currency === 'EGP') {
        // سعر يوم الإيداع → التكلفة الحقيقية بالدرهم (يُظهر أثر تخفيض الجنيه)
        investedAED += amount / Number(d.aed_egp_rate || fxRate);
      } else {
        investedAED += amount;
      }
    }

    const val = latestValuation.get(fund.id);
    const nativeCurrency = fund.country === 'EG' ? 'EGP' : 'AED';
    const currentNative = val ? Number(val.current_value) : investedNative;
    const currentAED = toAED(
      currentNative,
      val?.currency || nativeCurrency,
      fxRate
    );

    holdings.push({
      fund,
      investedNative,
      investedAED,
      currentNative,
      currentAED,
      returnPct:
        investedAED > 0 ? (currentAED - investedAED) / investedAED : null,
      weight: 0, // يتحسب بعد الإجمالي
      lastValuationDate: val ? val.date : null,
    });
  }

  const totalInvestedAED = holdings.reduce((s, h) => s + h.investedAED, 0);
  const totalValueAED = holdings.reduce((s, h) => s + h.currentAED, 0);
  for (const h of holdings) {
    h.weight = totalValueAED > 0 ? h.currentAED / totalValueAED : 0;
  }

  const egValueAED = holdings
    .filter((h) => h.fund.country === 'EG')
    .reduce((s, h) => s + h.currentAED, 0);
  const aeValueAED = totalValueAED - egValueAED;

  const egByClassAED: Record<string, number> = {};
  for (const h of holdings) {
    if (h.fund.country !== 'EG') continue;
    const cls = h.fund.asset_class || 'diversified';
    egByClassAED[cls] = (egByClassAED[cls] || 0) + h.currentAED;
  }

  // الإيداعات الشهرية بالدرهم (آخر 12 شهر فيهم إيداعات)
  const byMonth = new Map<string, { EG: number; AE: number }>();
  const fundCountry = new Map(funds.map((f) => [f.id, f.country]));
  for (const d of deposits) {
    const month = d.date.slice(0, 7);
    const row = byMonth.get(month) || { EG: 0, AE: 0 };
    const aed =
      d.currency === 'EGP'
        ? Number(d.amount) / Number(d.aed_egp_rate || fxRate)
        : Number(d.amount);
    const country = fundCountry.get(d.fund_id) || 'AE';
    row[country] += aed;
    byMonth.set(month, row);
  }
  const monthlyDeposits: MonthlyDepositRow[] = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, v]) => ({ month, EG: v.EG, AE: v.AE }));

  // DCA streak: شهور متتالية فيها إيداع، بالرجوع من الشهر الحالي
  // (لو الشهر الحالي لسه مفيهوش إيداع، نبدأ العد من الشهر اللي فات)
  const monthsWithDeposit = new Set(deposits.map((d) => d.date.slice(0, 7)));
  let dcaStreak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  if (!monthsWithDeposit.has(currentKey)) {
    cursor.setMonth(cursor.getMonth() - 1);
  }
  for (;;) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    if (!monthsWithDeposit.has(key)) break;
    dcaStreak++;
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return {
    holdings,
    totalInvestedAED,
    totalValueAED,
    totalReturnPct:
      totalInvestedAED > 0
        ? (totalValueAED - totalInvestedAED) / totalInvestedAED
        : null,
    egValueAED,
    aeValueAED,
    egWeight: totalValueAED > 0 ? egValueAED / totalValueAED : 0,
    aeWeight: totalValueAED > 0 ? aeValueAED / totalValueAED : 0,
    egByClassAED,
    fxRate,
    dcaStreak,
    monthlyDeposits,
  };
}

// ============ تنبيهات المحفظة (محسوبة بالكود) ============
// «نبهني لو في مشكلة» — بتتحسب من بياناته المسجلة عند كل فتح للداشبورد

export type PortfolioAlert = { level: 'warn' | 'info'; text: string };

export function buildAlerts(
  summary: PortfolioSummary,
  deposits: Deposit[],
  fx: FxRow[],
  now: Date = new Date()
): PortfolioAlert[] {
  const alerts: PortfolioAlert[] = [];

  // 1) صندوق خسران أكتر من 5% (شامل أثر العملة)
  for (const h of summary.holdings) {
    if (h.returnPct !== null && h.returnPct < -0.05) {
      alerts.push({
        level: 'warn',
        text: `«${h.fund.name}» خسران ${(h.returnPct * 100).toFixed(1)}% — مش لازم تبيع بسرعة، بس راجعه في جلستك الجاية.`,
      });
    }
  }

  // 2) حركة قوية في سعر الصرف خلال آخر ~30 يوم
  if (fx.length >= 2) {
    const sorted = [...fx].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const past =
      [...sorted].reverse().find((r) => r.date <= cutoff) ?? sorted[0];
    if (past.date !== latest.date) {
      const change = Number(latest.aed_egp) / Number(past.aed_egp) - 1;
      if (Math.abs(change) > 0.03) {
        alerts.push({
          level: 'warn',
          text: `الجنيه ${change > 0 ? 'ضعف' : 'قوي'} ${(Math.abs(change) * 100).toFixed(1)}% مقابل الدرهم خلال الفترة الأخيرة — ده بيأثر على حساب مصر × الإمارات.`,
        });
      }
    }
  }

  // 3) الشهر قرب يخلص من غير إيداع (حماية الـ DCA streak)
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const hasThisMonth = deposits.some((d) => d.date.startsWith(monthKey));
  if (deposits.length > 0 && !hasThisMonth && now.getDate() >= 20) {
    alerts.push({
      level: 'info',
      text: 'الشهر قرب يخلص ولسه مسجلتش إيداع — حافظ على التزامك الشهري حتى لو بمبلغ صغير.',
    });
  }

  // 4) قيم الصناديق محتاجة تحديث (أقدم من 35 يوم)
  const staleCutoff = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  for (const h of summary.holdings) {
    if (h.investedNative <= 0) continue;
    if (!h.lastValuationDate) {
      alerts.push({
        level: 'info',
        text: `«${h.fund.name}» لسه معملتلوش أي تحديث قيمة — حدّثه من صفحة المحفظة عشان العائد يتحسب صح.`,
      });
    } else if (h.lastValuationDate < staleCutoff) {
      alerts.push({
        level: 'info',
        text: `آخر تحديث قيمة لـ «${h.fund.name}» من أكتر من شهر (${h.lastValuationDate}) — حدّثه من صفحة المحفظة.`,
      });
    }
  }

  return alerts.slice(0, 6);
}

// ============ توصية توزيع الجلسة الشهرية ============
// المنطق: الإيداع يروح للفئة/الدولة الأبعد عن هدفها
// + قاعدة: أقل من 500 درهم = وجهة واحدة بدون تشتيت
// + احترام سقف التعرض لمصر (eg_exposure_cap)

export type AllocationLine = {
  label: string;
  country: 'EG' | 'AE';
  assetClass?: string;
  amountAED: number;
};

export type Recommendation = {
  lines: AllocationLine[];
  rationale: string[];
};

export function recommendAllocation(
  budgetAED: number,
  summary: PortfolioSummary,
  settings: Settings,
  funds: Fund[]
): Recommendation {
  const rationale: string[] = [];

  // التوصية تتقيد بالصناديق المفعّلة فعلًا — مفيش ترشيح لسوق مش متاح للمستخدم
  const active = funds.filter((f) => f.is_active);
  const egAvailable = active.some((f) => f.country === 'EG');
  const aeAvailable = active.some((f) => f.country === 'AE');

  if (!egAvailable && !aeAvailable) {
    return {
      lines: [],
      rationale: [
        'مفيش أي صندوق مفعّل — ضيف صناديقك المتاحة من صفحة المحفظة الأول.',
      ],
    };
  }

  const newTotal = summary.totalValueAED + budgetAED;
  let egAmount: number;
  let aeAmount: number;

  if (!aeAvailable) {
    egAmount = budgetAED;
    aeAmount = 0;
    rationale.push(
      'الإمارات مش متاحة عندك حاليًا (مفيش صندوق إماراتي مفعّل) — فالمبلغ كله اتوجه لمصر.'
    );
  } else if (!egAvailable) {
    egAmount = 0;
    aeAmount = budgetAED;
    rationale.push(
      'مصر مش متاحة عندك حاليًا (مفيش صندوق مصري مفعّل) — فالمبلغ كله اتوجه للإمارات.'
    );
  } else {
    // كام محتاجين نضيف لكل دولة عشان نوصل للوزن المستهدف بعد الإيداع؟
    const egTargetValue = Number(settings.eg_target) * newTotal;
    const egGapAED = Math.max(0, egTargetValue - summary.egValueAED);
    egAmount = Math.min(budgetAED, egGapAED);
    aeAmount = budgetAED - egAmount;

    // سقف التعرض لمصر
    const cap = Number(settings.eg_exposure_cap);
    const egAfter = summary.egValueAED + egAmount;
    if (newTotal > 0 && egAfter / newTotal > cap) {
      const maxEg = Math.max(0, cap * newTotal - summary.egValueAED);
      rationale.push(
        `سقف التعرض لمصر (${(cap * 100).toFixed(0)}%) قلّل نصيب مصر الشهر ده.`
      );
      egAmount = Math.min(egAmount, maxEg);
      aeAmount = budgetAED - egAmount;
    }
  }

  // داخل مصر: التقسيم على الفئات المتاحة فعلًا بس
  const hasMM = active.some(
    (f) => f.country === 'EG' && f.asset_class === 'money_market'
  );
  const hasEq = active.some(
    (f) => f.country === 'EG' && f.asset_class === 'equity'
  );

  let egMMAmount = 0;
  let egEqAmount = 0;
  if (egAmount > 0) {
    if (hasMM && hasEq) {
      const egMM = summary.egByClassAED['money_market'] || 0;
      const egAfterDeposit = summary.egValueAED + egAmount;
      const mmTargetValue =
        Number(settings.eg_money_market_target) * egAfterDeposit;
      const mmGap = Math.max(0, mmTargetValue - egMM);
      egMMAmount = Math.min(egAmount, mmGap);
      egEqAmount = egAmount - egMMAmount;
    } else if (hasMM) {
      egMMAmount = egAmount;
      rationale.push(
        'مفيش صندوق أسهم مصري مفعّل — فنصيب مصر كله راح للصندوق النقدي (الأضمن كبداية).'
      );
    } else if (hasEq) {
      egEqAmount = egAmount;
      rationale.push('مفيش صندوق نقدي مصري مفعّل — فنصيب مصر راح للأسهم.');
    } else {
      // فئات تانية بس (ذهب مثلًا) — نوجه لأول فئة متاحة
      egMMAmount = egAmount;
    }
  }

  let lines: AllocationLine[] = [];
  if (egMMAmount > 0)
    lines.push({
      label: 'مصر — نقدي/سيولة',
      country: 'EG',
      assetClass: hasMM ? 'money_market' : undefined,
      amountAED: egMMAmount,
    });
  if (egEqAmount > 0)
    lines.push({
      label: 'مصر — أسهم',
      country: 'EG',
      assetClass: 'equity',
      amountAED: egEqAmount,
    });
  if (aeAmount > 0)
    lines.push({
      label: 'الإمارات — المحفظة المُدارة',
      country: 'AE',
      amountAED: aeAmount,
    });

  // قاعدة أقل من 500 درهم: وجهة واحدة بدون تشتيت
  if (budgetAED < 500 && lines.length > 1) {
    const biggest = lines.reduce((a, b) =>
      b.amountAED > a.amountAED ? b : a
    );
    lines = [{ ...biggest, amountAED: budgetAED }];
    rationale.push(
      'الميزانية أقل من 500 درهم → وجهة واحدة بس بدون تشتيت (الأبعد عن هدفها).'
    );
  }

  rationale.push(
    `الوزن الحالي: مصر ${(summary.egWeight * 100).toFixed(1)}% × هدف ${(Number(settings.eg_target) * 100).toFixed(0)}% — الإمارات ${(summary.aeWeight * 100).toFixed(1)}% × هدف ${(Number(settings.ae_target) * 100).toFixed(0)}%.`
  );
  rationale.push('الإيداع بيروح للفئة/الدولة الأبعد عن هدفها.');

  return { lines, rationale };
}
