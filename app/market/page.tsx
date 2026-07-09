'use client';

import { useState } from 'react';
import TradingViewWidget from '@/components/TradingViewWidget';
import { buildSummary, dStar } from '@/lib/calc';
import { fmtPct } from '@/lib/format';
import { usePortfolioData } from '@/lib/usePortfolioData';

type Tab = 'EG' | 'AE' | 'COMPARE';

const TV = {
  ticker: 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js',
  overview:
    'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js',
  screener:
    'https://s3.tradingview.com/external-embedding/embed-widget-screener.js',
};

const common = {
  colorTheme: 'dark',
  isTransparent: true,
  locale: 'ar_AE',
};

export default function MarketPage() {
  const [tab, setTab] = useState<Tab>('EG');
  const { settings, funds, deposits, valuations, fx, loading } =
    usePortfolioData();

  const summary = !loading
    ? buildSummary(funds, deposits, valuations, fx)
    : null;
  const d = settings ? dStar(settings) : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'EG', label: '🇪🇬 السوق المصري' },
    { key: 'AE', label: '🇦🇪 سوق الإمارات' },
    { key: 'COMPARE', label: '⚖️ مقارنة' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">السوق</h1>
        <p className="text-xs text-zinc-500">
          بيانات لحظية من TradingView — للمتابعة والاطلاع، قرارك الشهري بيتاخد
          من كارت «أستثمره فين؟» في الداشبورد
        </p>
      </div>

      {/* شريط لحظي مستمر: المؤشرات + العملات */}
      <TradingViewWidget
        src={TV.ticker}
        height={50}
        config={{
          ...common,
          symbols: [
            { proName: 'EGX:EGX30', title: 'EGX 30' },
            { proName: 'DFM:DFMGI', title: 'مؤشر دبي' },
            { proName: 'ADX:FADGI', title: 'مؤشر أبوظبي' },
            { proName: 'FX_IDC:USDEGP', title: 'دولار/جنيه' },
            { proName: 'FX_IDC:AEDEGP', title: 'درهم/جنيه' },
          ],
          showSymbolLogo: true,
          displayMode: 'adaptive',
        }}
      />

      {/* التبويبات: مصر × الإمارات × مقارنة */}
      <div className="flex gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-bold transition-all sm:px-4 sm:py-2.5 sm:text-sm ${
              tab === t.key
                ? 'bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ====== السوق المصري ====== */}
      {tab === 'EG' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              مؤشر EGX 30
            </h2>
            <TradingViewWidget
              src={TV.overview}
              height={400}
              config={{
                ...common,
                symbols: [['EGX 30', 'EGX:EGX30|6M']],
                chartOnly: false,
                width: '100%',
                height: 400,
                autosize: true,
                showVolume: false,
                chartType: 'area',
                lineColor: '#d4a017',
                topColor: 'rgba(212,160,23,0.25)',
                bottomColor: 'rgba(212,160,23,0)',
                dateRanges: ['1m|30', '3m|60', '6m|1D', '12m|1D', '60m|1W'],
              }}
            />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              الشركات المصرية — الأعلى صعودًا وهبوطًا والأنشط تداولًا
            </h2>
            <p className="mb-3 text-xs text-zinc-500">
              غيّر الفلتر من القائمة داخل الجدول (Top Gainers / Top Losers /
              Most Active)
            </p>
            <TradingViewWidget
              src={TV.screener}
              height={520}
              config={{
                ...common,
                width: '100%',
                height: 520,
                defaultColumn: 'overview',
                defaultScreen: 'top_gainers',
                market: 'egypt',
                showToolbar: true,
              }}
            />
          </div>
        </div>
      )}

      {/* ====== سوق الإمارات ====== */}
      {tab === 'AE' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              مؤشرات دبي وأبوظبي
            </h2>
            <TradingViewWidget
              src={TV.overview}
              height={400}
              config={{
                ...common,
                symbols: [
                  ['سوق دبي المالي', 'DFM:DFMGI|6M'],
                  ['سوق أبوظبي', 'ADX:FADGI|6M'],
                ],
                chartOnly: false,
                width: '100%',
                height: 400,
                autosize: true,
                showVolume: false,
                chartType: 'area',
                lineColor: '#10b981',
                topColor: 'rgba(16,185,129,0.25)',
                bottomColor: 'rgba(16,185,129,0)',
                dateRanges: ['1m|30', '3m|60', '6m|1D', '12m|1D', '60m|1W'],
              }}
            />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              الشركات الإماراتية — الأعلى صعودًا وهبوطًا والأنشط تداولًا
            </h2>
            <p className="mb-3 text-xs text-zinc-500">
              غيّر الفلتر من القائمة داخل الجدول (Top Gainers / Top Losers /
              Most Active)
            </p>
            <TradingViewWidget
              src={TV.screener}
              height={520}
              config={{
                ...common,
                width: '100%',
                height: 520,
                defaultColumn: 'overview',
                defaultScreen: 'top_gainers',
                market: 'uae',
                showToolbar: true,
              }}
            />
          </div>
        </div>
      )}

      {/* ====== المقارنة ====== */}
      {tab === 'COMPARE' && (
        <div className="space-y-5">
          {/* أرقامك أنت — جوهر المقارنة */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-amber-600/40 bg-gradient-to-l from-zinc-900 to-amber-950/30 p-5">
              <p className="text-xs text-amber-300/80">نقطة التعادل بتاعتك</p>
              <p className="num mt-1 text-3xl font-black text-amber-400">
                {d !== null ? fmtPct(d) : '—'}
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                مصر تكسب طالما تخفيض الجنيه المتوقع أقل من الرقم ده سنويًا
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs text-zinc-500">وزن مصر في محفظتك</p>
              <p className="num mt-1 text-3xl font-black text-amber-400">
                {summary ? fmtPct(summary.egWeight) : '—'}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                المستهدف:{' '}
                <span className="num">
                  {settings ? fmtPct(Number(settings.eg_target), 0) : '—'}
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs text-zinc-500">وزن الإمارات في محفظتك</p>
              <p className="num mt-1 text-3xl font-black text-emerald-400">
                {summary ? fmtPct(summary.aeWeight) : '—'}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                المستهدف:{' '}
                <span className="num">
                  {settings ? fmtPct(Number(settings.ae_target), 0) : '—'}
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-bold text-zinc-300">
              أداء المؤشرات الثلاثة جنبًا إلى جنب — قلّب بينهم
            </h2>
            <TradingViewWidget
              src={TV.overview}
              height={420}
              config={{
                ...common,
                symbols: [
                  ['مصر EGX 30', 'EGX:EGX30|12M'],
                  ['دبي DFM', 'DFM:DFMGI|12M'],
                  ['أبوظبي ADX', 'ADX:FADGI|12M'],
                ],
                chartOnly: false,
                width: '100%',
                height: 420,
                autosize: true,
                showVolume: false,
                chartType: 'area',
                lineColor: '#d4a017',
                topColor: 'rgba(212,160,23,0.25)',
                bottomColor: 'rgba(212,160,23,0)',
                dateRanges: ['3m|60', '6m|1D', '12m|1D', '60m|1W'],
              }}
            />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="mb-2 text-sm font-bold text-zinc-300">
              عايز تعرف تحط مبلغ معين فين؟
            </h2>
            <p className="text-sm leading-6 text-zinc-400">
              ارجع للداشبورد واستخدم كارت{' '}
              <span className="font-bold text-amber-300">
                «معايا مبلغ الشهر ده — أستثمره فين؟»
              </span>{' '}
              — دخّل المبلغ بأي عملة (جنيه / درهم / دولار) وهيحددلك الصندوق
              بالاسم حسب استراتيجيتك ونقطة التعادل. أو اسأل{' '}
              <span className="font-bold text-amber-300">المستشار</span> في
              الشات وهيرد عليك بأرقامك الفعلية.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
