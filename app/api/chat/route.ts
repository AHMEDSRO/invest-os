import { NextResponse } from 'next/server';
import { buildSummary, dStar } from '@/lib/calc';
import { chatCompletion, type LlmMessage } from '@/lib/llm';
import { createSupabaseServer } from '@/lib/supabase/server';
import type {
  ChatMessage,
  Deposit,
  Fund,
  FxRow,
  MonthlyReview,
  Settings,
  Valuation,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

// System prompt للبوت — حرفيًا حسب المواصفات
const SYSTEM_PROMPT = `أنت "مستشار Invest-OS" — مساعد شخصي لأحمد متخصص فقط في: محفظته الاستثمارية، صناديق الاستثمار المصرية (ثاندر)، منصات الإمارات (Sarwa/StashAway)، مقارنة العائد بين الجنيه والدرهم، نقطة التعادل d*، استراتيجية الـ DCA الشهرية، وقراءة بياناته المرفقة في السياق. ترد بالمصري، مباشر، أرقام قبل الكلام. أي سؤال خارج هذه المواضيع (برمجة، طبخ، سياسة، أي حاجة تانية): اعتذر بسطر واحد ورجّعه لموضوع الاستثمار. لست مستشارًا ماليًا مرخّصًا — ذكّر أحمد بذلك عند أي قرار كبير، والقرار النهائي دائمًا له. لا تخترع أرقامًا: لو معلومة مش في السياق المرفق قل "مش عندي الرقم ده — حدّثه في النظام".`;

// Rate limit بسيط: 30 رسالة/ساعة (نفضل جوه الـ free tier)
const RATE_LIMIT = 30;
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
      { error: 'وصلت لحد الرسائل (30/ساعة) — جرب بعد شوية' },
      { status: 429 }
    );
  }

  const { message } = (await req.json()) as { message?: string };
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'رسالة فاضية' }, { status: 400 });
  }
  hits.push(now);

  // حقن السياق (RAG مبسّط): بيانات أحمد من Supabase
  const [
    settingsRes,
    fundsRes,
    allDepositsRes,
    valuationsRes,
    fxAllRes,
    reviewsRes,
    historyRes,
  ] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).single(),
    supabase.from('funds').select('*'),
    supabase.from('deposits').select('*').order('date', { ascending: true }),
    supabase.from('valuations').select('*'),
    supabase.from('fx_history').select('*').order('date', { ascending: true }),
    supabase
      .from('monthly_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const settings = settingsRes.data as Settings | null;
  const funds = (fundsRes.data as Fund[]) ?? [];
  const allDeposits = (allDepositsRes.data as Deposit[]) ?? [];
  const valuations = (valuationsRes.data as Valuation[]) ?? [];
  const fxAll = (fxAllRes.data as FxRow[]) ?? [];
  const reviews = (reviewsRes.data as MonthlyReview[]) ?? [];
  const history = ((historyRes.data as ChatMessage[]) ?? []).reverse();

  const summary = buildSummary(funds, allDeposits, valuations, fxAll);
  const fundName = new Map(funds.map((f) => [f.id, f.name]));

  const context = {
    'الإعدادات والاستراتيجية': settings
      ? {
          'وزن مصر المستهدف': settings.eg_target,
          'وزن الإمارات المستهدف': settings.ae_target,
          'سقف التعرض لمصر': settings.eg_exposure_cap,
          'هدف النقدي داخل مصر': settings.eg_money_market_target,
          'هدف الأسهم داخل مصر': settings.eg_equity_target,
          'العائد المتوقع مصر': settings.expected_yield_eg,
          'العائد المتوقع الإمارات': settings.expected_yield_ae,
          'نقطة التعادل d*': +dStar(settings).toFixed(4),
        }
      : 'غير متاحة',
    'ملخص المحفظة': {
      'القيمة الحالية بالدرهم': +summary.totalValueAED.toFixed(0),
      'إجمالي المستثمَر بالدرهم': +summary.totalInvestedAED.toFixed(0),
      'العائد الكلي': summary.totalReturnPct
        ? `${(summary.totalReturnPct * 100).toFixed(1)}%`
        : 'غير محسوب',
      'وزن مصر الفعلي': `${(summary.egWeight * 100).toFixed(1)}%`,
      'وزن الإمارات الفعلي': `${(summary.aeWeight * 100).toFixed(1)}%`,
      'شهور الالتزام المتتالية': summary.dcaStreak,
      'آخر سعر AED/EGP': summary.fxRate,
      الحيازات: summary.holdings.map((h) => ({
        الصندوق: h.fund.name,
        الدولة: h.fund.country,
        'المستثمَر بالدرهم': +h.investedAED.toFixed(0),
        'القيمة الحالية بالدرهم': +h.currentAED.toFixed(0),
        'العائد': h.returnPct
          ? `${(h.returnPct * 100).toFixed(1)}%`
          : 'غير محسوب',
      })),
    },
    'آخر 20 إيداع': allDeposits.slice(-20).map((d) => ({
      التاريخ: d.date,
      الصندوق: fundName.get(d.fund_id) || d.fund_id,
      المبلغ: `${d.amount} ${d.currency}`,
      'سعر الصرف': d.aed_egp_rate,
    })),
    'آخر 3 جلسات شهرية': reviews.map((r) => ({
      الشهر: r.month,
      'ملخص السوق': r.market_summary,
      القرار: r.decision,
      'd*': r.d_star,
    })),
    'آخر 6 أسعار صرف': fxAll.slice(-6),
  };

  const system = `${SYSTEM_PROMPT}\n\n### بيانات أحمد الحالية من النظام (السياق المرفق):\n${JSON.stringify(context, null, 1)}`;

  const messages: LlmMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  let reply: string;
  try {
    reply = await chatCompletion(system, messages);
  } catch (err) {
    return NextResponse.json(
      {
        error: `مشكلة في الاتصال بالمستشار: ${
          err instanceof Error ? err.message : 'خطأ غير معروف'
        }`,
      },
      { status: 502 }
    );
  }

  // حفظ المحادثة (المستخدم أولًا ثم الرد للحفاظ على الترتيب)
  await supabase.from('chat_messages').insert({ role: 'user', content: message });
  await supabase
    .from('chat_messages')
    .insert({ role: 'assistant', content: reply });

  return NextResponse.json({ reply });
}
