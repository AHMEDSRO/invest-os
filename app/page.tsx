'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import GuideCard from '@/components/GuideCard';
import { buildAlerts, buildSummary, dStar } from '@/lib/calc';
import { fmtAED, fmtNum, fmtPct } from '@/lib/format';
import { ASSET_CLASS_AR } from '@/lib/types';
import { usePortfolioData } from '@/lib/usePortfolioData';

const EG_COLOR = '#d4a017'; // ذهبي
const AE_COLOR = '#10b981'; // أخضر
const PIE_COLORS = ['#d4a017', '#f59e0b', '#fbbf24', '#a16207', '#facc15'];

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '8px',
  direction: 'rtl' as const,
};

function KpiCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/50 p-5 transition-all hover:border-amber-600/30 hover:shadow-lg hover:shadow-amber-950/20">
      <p className="text-xs text-zinc-400 md:text-sm">{title}</p>
      <p className="num mt-2 text-xl font-bold text-zinc-50 md:text-2xl">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/50 p-5 transition-colors hover:border-zinc-700">
      <h2 className="mb-4 text-sm font-bold text-zinc-300">{title}</h2>
      <div className="h-64" dir="ltr">
        {children}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { settings, funds, deposits, valuations, fx, loading, error } =
    usePortfolioData();

  if (loading)
    return <p className="py-20 text-center text-zinc-500">جاري التحميل…</p>;
  if (error)
    return <p className="py-20 text-center text-red-400">{error}</p>;

  const summary = buildSummary(funds, deposits, valuations, fx);
  const d = settings ? dStar(settings) : null;
  const alerts = buildAlerts(summary, deposits, fx);

  const allocationData = settings
    ? [
        {
          name: 'مصر',
          الفعلي: +(summary.egWeight * 100).toFixed(1),
          المستهدف: +(Number(settings.eg_target) * 100).toFixed(1),
        },
        {
          name: 'الإمارات',
          الفعلي: +(summary.aeWeight * 100).toFixed(1),
          المستهدف: +(Number(settings.ae_target) * 100).toFixed(1),
        },
      ]
    : [];

  const monthlyData = summary.monthlyDeposits.map((m) => ({
    month: m.month,
    مصر: +m.EG.toFixed(0),
    الإمارات: +m.AE.toFixed(0),
  }));

  const egClassData = Object.entries(summary.egByClassAED).map(
    ([cls, val]) => ({
      name: ASSET_CLASS_AR[cls] || cls,
      value: +val.toFixed(0),
    })
  );

  const fxData = fx.map((r) => ({
    date: r.date,
    rate: Number(r.aed_egp),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الداشبورد</h1>

      {/* سؤال الشهر — قلب التطبيق */}
      <GuideCard />

      {/* التنبيهات */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm leading-6 ${
                a.level === 'warn'
                  ? 'border-red-800/60 bg-red-950/30 text-red-200'
                  : 'border-amber-700/40 bg-amber-950/20 text-amber-200/90'
              }`}
            >
              <span>{a.level === 'warn' ? '⚠️' : '💡'}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* كروت KPI */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <KpiCard
          title="قيمة المحفظة (موحّدة بالدرهم)"
          value={fmtAED(summary.totalValueAED)}
          sub={`سعر الصرف المستخدم: ${fmtNum(summary.fxRate, 2)} EGP/AED`}
        />
        <KpiCard
          title="إجمالي المستثمَر"
          value={fmtAED(summary.totalInvestedAED)}
        />
        <KpiCard
          title="العائد الكلي (شامل أثر العملة)"
          value={fmtPct(summary.totalReturnPct)}
        />
        <KpiCard
          title="شهور الالتزام المتتالية (DCA)"
          value={`${fmtNum(summary.dcaStreak)} شهر`}
        />
      </div>

      {/* كارت نقطة التعادل d* */}
      {settings && d !== null && (
        <div className="rounded-2xl border border-amber-600/40 bg-gradient-to-l from-zinc-900 to-amber-950/30 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-amber-300/80">
                نقطة التعادل بين مصر والإمارات
              </p>
              <p className="num mt-1 text-3xl font-black text-amber-400 md:text-4xl">
                d* = {fmtPct(d)}
              </p>
            </div>
            <p className="max-w-md text-sm leading-6 text-zinc-300">
              مصر تكسب طالما تخفيض الجنيه المتوقع أقل من{' '}
              <span className="num font-bold text-amber-300">{fmtPct(d)}</span>{' '}
              سنويًا — محسوبة من عائد متوقع{' '}
              <span className="num">{fmtPct(Number(settings.expected_yield_eg), 0)}</span>{' '}
              في مصر مقابل{' '}
              <span className="num">{fmtPct(Number(settings.expected_yield_ae), 0)}</span>{' '}
              في الإمارات.
            </p>
          </div>
        </div>
      )}

      {/* الرسوم البيانية */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="التوزيع الفعلي × المستهدف (%)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={allocationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
              <YAxis stroke="#a1a1aa" fontSize={12} unit="%" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="الفعلي" fill={EG_COLOR} radius={[6, 6, 0, 0]} />
              <Bar dataKey="المستهدف" fill="#52525b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="الإيداعات الشهرية بالدرهم">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#a1a1aa" fontSize={11} />
              <YAxis stroke="#a1a1aa" fontSize={12} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="مصر" stackId="a" fill={EG_COLOR} />
              <Bar
                dataKey="الإمارات"
                stackId="a"
                fill={AE_COLOR}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="تقسيمة الأصول داخل مصر (بالدرهم)">
          {egClassData.length === 0 ? (
            <p className="pt-24 text-center text-sm text-zinc-600">
              لسه مفيش حيازات مصرية
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={egClassData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {egClassData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      stroke="#18181b"
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="تاريخ سعر AED/EGP">
          {fxData.length === 0 ? (
            <p className="pt-24 text-center text-sm text-zinc-600">
              لسه مفيش أسعار صرف مسجلة — بتتسجل تلقائيًا مع كل إيداع
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fxData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#a1a1aa" fontSize={11} />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={12}
                  domain={['auto', 'auto']}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="AED/EGP"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
