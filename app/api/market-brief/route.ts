import { NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/llm';
import { createSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// كاش 6 ساعات — الأخبار مش بتتغير كل دقيقة ونوفر الـ free tier
const CACHE_MS = 6 * 60 * 60 * 1000;
let cache: { brief: string; at: number } | null = null;

// عناوين حقيقية من Google News RSS (مجاني وبدون مفاتيح) —
// بديل للبحث المدمج غير المتاح على الـ free tier
async function fetchHeadlines(query: string, limit = 5): Promise<string[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=ar&gl=EG&ceid=EG:ar`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    return items
      .slice(0, limit)
      .map((item) => {
        const title =
          item.match(
            /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/
          )?.[1] ?? '';
        const date = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '';
        return `- ${title.trim()} (${date.slice(0, 16)})`;
      })
      .filter((t) => t.length > 10);
  } catch {
    return [];
  }
}

export async function GET() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'غير مسجّل دخول' }, { status: 401 });
  }

  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return NextResponse.json({ brief: cache.brief, cached: true });
  }

  const [cbe, fxNews, egx, uae, gold] = await Promise.all([
    fetchHeadlines('البنك المركزي المصري سعر الفائدة'),
    fetchHeadlines('سعر الدولار مقابل الجنيه المصري'),
    fetchHeadlines('البورصة المصرية EGX30'),
    fetchHeadlines('أسواق الأسهم الإمارات دبي أبوظبي'),
    fetchHeadlines('سعر الذهب في مصر'),
  ]);

  const allHeadlines = [
    '## فائدة المركزي المصري:',
    ...cbe,
    '## الجنيه والدولار:',
    ...fxNews,
    '## البورصة المصرية:',
    ...egx,
    '## أسواق الإمارات:',
    ...uae,
    '## الذهب:',
    ...gold,
  ].join('\n');

  if (cbe.length + fxNews.length + egx.length + uae.length + gold.length === 0) {
    return NextResponse.json(
      { error: 'مش قادر أجيب الأخبار دلوقتي — حاول بعد شوية' },
      { status: 502 }
    );
  }

  const system = `أنت مرشد استثماري لأحمد — مستثمر مصري مبتدئ بيستثمر مبلغ صغير شهريًا في صناديق الاستثمار بين مصر (بالجنيه) والإمارات (بالدرهم).

دي أحدث عناوين الأخبار الحقيقية من Google News (بتاريخ كل خبر). اعتمد عليها فقط — ممنوع تضيف أي معلومة أو رقم مش موجود فيها:

${allHeadlines}

اكتب له موجز سوق قصير بالمصري البسيط جدًا من غير مصطلحات معقدة: 5 نقط بالكتير (فايدة المركزي، الجنيه، البورصة المصرية، أسواق الإمارات، الذهب) — كل نقطة سطر أو اتنين بالمعلومة وتاريخها وتبدأ بشرطة -. لو موضوع مفيش عنه خبر واضح في العناوين قل "مفيش جديد واضح". وفي الآخر سطر واحد بعنوان «يعني إيه ده ليك؟» يربط الصورة بقراره الشهري بشكل عام من غير توصية جازمة. متكتبش مقدمات، واكتب نص عادي تمامًا من غير أي تنسيق markdown — ممنوع النجوم ** نهائيًا.`;

  let brief: string;
  try {
    brief = await chatCompletion(system, [
      { role: 'user', content: 'إيه أخبار السوق؟' },
    ]);
  } catch (err) {
    return NextResponse.json(
      {
        error: `مش قادر ألخص الأخبار دلوقتي: ${
          err instanceof Error ? err.message : 'خطأ غير معروف'
        }`,
      },
      { status: 502 }
    );
  }

  cache = { brief, at: now };
  return NextResponse.json({ brief, cached: false });
}
