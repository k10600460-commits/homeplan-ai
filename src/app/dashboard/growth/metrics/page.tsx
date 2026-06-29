import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MASTER_USER_ID = "12d6d041-dc0a-4772-8aa7-d71fa2ff43a7";

type GrowthDailyMetric = {
  id: string;
  metric_date: string;
  connects_sent: number;
  dms_sent: number;
  emails_sent: number;
  follow_ups_sent: number;
  connect_accepts: number;
  replies: number;
  positive_replies: number;
  proposals_built: number;
  demos_booked: number;
  trials_started: number;
  paid_new: number;
  mrr: number | string | null;
  bounce_rate: number | string | null;
  complaint_rate: number | string | null;
  created_at: string;
  updated_at: string;
};

const METRIC_SELECT = `
  id,
  metric_date,
  connects_sent,
  dms_sent,
  emails_sent,
  follow_ups_sent,
  connect_accepts,
  replies,
  positive_replies,
  proposals_built,
  demos_booked,
  trials_started,
  paid_new,
  mrr,
  bounce_rate,
  complaint_rate,
  created_at,
  updated_at
`;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(value: number | string | null) {
  if (value === null) return "-";
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numberValue);
}

function totalTouches(metric: GrowthDailyMetric) {
  return metric.connects_sent + metric.dms_sent + metric.emails_sent + metric.follow_ups_sent;
}

function todayMetricDate() {
  return new Date().toISOString().slice(0, 10);
}

function MetricCell({ value }: { value: number }) {
  return <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums">{value}</td>;
}

export default async function GrowthMetricsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (user.id !== MASTER_USER_ID) notFound();

  const { data, error } = await supabase
    .from("growth_daily_metrics")
    .select(METRIC_SELECT)
    .order("metric_date", { ascending: false })
    .limit(30);

  const metrics = (data ?? []) as GrowthDailyMetric[];
  const today = metrics.find((metric) => metric.metric_date === todayMetricDate()) ?? null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Internal</p>
            <h1 className="text-xl font-bold text-gray-900">Sales Metrics</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <a href="/dashboard/growth" className="text-gray-500 hover:text-gray-900">Growth CRM</a>
            <a href="/dashboard" className="text-gray-500 hover:text-gray-900">Dashboard</a>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load growth metrics.
          </div>
        )}

        <section className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Today</h2>
            <span className="text-xs font-medium text-gray-400">{formatDate(todayMetricDate())}</span>
          </div>

          {today ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-px bg-gray-100">
              {[
                { label: "Touches", value: totalTouches(today) },
                { label: "Accepts", value: today.connect_accepts },
                { label: "Replies", value: today.replies },
                { label: "Positive", value: today.positive_replies },
                { label: "Proposals", value: today.proposals_built },
                { label: "Demos", value: today.demos_booked },
                { label: "Trials", value: today.trials_started },
                { label: "Paid", value: today.paid_new },
                { label: "MRR", value: formatCurrency(today.mrr) },
              ].map((item) => (
                <div key={item.label} className="bg-white px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              No metrics snapshot has been recorded for today.
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Last 30 days</h2>
            <span className="text-xs font-medium text-gray-400">{metrics.length} snapshots</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-widest text-gray-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Touches</th>
                  <th className="px-4 py-3 text-right">Accepts</th>
                  <th className="px-4 py-3 text-right">Replies</th>
                  <th className="px-4 py-3 text-right">Positive</th>
                  <th className="px-4 py-3 text-right">Proposals</th>
                  <th className="px-4 py-3 text-right">Demos</th>
                  <th className="px-4 py-3 text-right">Trials</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                      No daily metrics snapshots yet.
                    </td>
                  </tr>
                ) : (
                  metrics.map((metric) => (
                    <tr key={metric.id} className="bg-white">
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatDate(metric.metric_date)}</td>
                      <MetricCell value={totalTouches(metric)} />
                      <MetricCell value={metric.connect_accepts} />
                      <MetricCell value={metric.replies} />
                      <MetricCell value={metric.positive_replies} />
                      <MetricCell value={metric.proposals_built} />
                      <MetricCell value={metric.demos_booked} />
                      <MetricCell value={metric.trials_started} />
                      <MetricCell value={metric.paid_new} />
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums">
                        {formatCurrency(metric.mrr)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
