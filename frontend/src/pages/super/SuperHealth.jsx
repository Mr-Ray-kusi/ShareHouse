import { useOutletContext } from 'react-router-dom';
import { Activity, Gauge, TriangleAlert, Wallet } from 'lucide-react';
import { AreaChart, DonutChart, MetricCard, PageIntro, Panel, ProgressList, DayStrip } from '../../components/super/SuperCharts';

export default function SuperHealth() {
  const { analysis } = useOutletContext();
  const health = analysis?.health || {};
  const mix = health.statusMix || {};

  return (
    <div>
      <PageIntro
        kicker="Pillar 1"
        title="Health & performance"
        subtitle="Is ShareHouse actually working? Watch API success, exceptions, Paystack, and load speed before you look at revenue."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={Activity} label="API success rate" value={health.successRate != null ? `${health.successRate}%` : '—'} delta={health.successDelta} hint="Since last week · 24h window" />
        <MetricCard icon={Gauge} label="Avg response" value={health.avgResponseMs ? `${health.avgResponseMs} ms` : '—'} hint={`${health.apiCalls || 0} API calls today`} />
        <MetricCard accent icon={TriangleAlert} label="Failures" value={(health.http500 || 0) + (health.jsErrors || 0)} hint={`${health.http500 || 0} HTTP 500 · ${health.jsErrors || 0} JS exceptions`} />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
        <Panel title="API traffic · last 14 days">
          <AreaChart data={health.series || []} valueKey="calls" labelKey="label" />
        </Panel>
        <Panel title="Status mix">
          <DonutChart
            centerLabel="Calls"
            slices={[
              { label: 'Success 2xx', value: mix.success || 0, color: '#2563eb' },
              { label: 'Client 4xx', value: mix.client || 0, color: '#0f172a' },
              { label: 'Server 5xx', value: mix.server || 0, color: '#cbd5e1' },
            ]}
          />
        </Panel>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4 mt-4">
        <Panel>
          <DayStrip days={health.weekStrip || []} countKey="errors" />
          <p className="text-xs text-slate-400 mt-3">Counts under each day are HTTP 500s. Today is highlighted.</p>
        </Panel>
        <Panel title="Slowest endpoints">
          <ProgressList
            items={(health.endpoints || []).map((e) => ({
              label: e.path,
              value: e.avgMs,
              suffix: `${e.avgMs} ms`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <MetricCard icon={Wallet} label="Paystack success" value={health.paystackSuccessRate != null ? `${health.paystackSuccessRate}%` : '—'} hint={`${health.paystackSuccess || 0} ok · ${health.paystackFail || 0} fail`} />
        <MetricCard label="LCP" value={health.lcpMs ? `${health.lcpMs} ms` : '—'} hint="Largest Contentful Paint · 7 days" />
        <MetricCard label="FID" value={health.fidMs ? `${health.fidMs} ms` : '—'} hint="First Input Delay · 7 days" />
      </div>

      {(health.jsErrorSamples || []).length > 0 && (
        <Panel title="Uncaught exceptions" className="mt-4">
          <ul className="space-y-2 text-sm">
            {health.jsErrorSamples.map((row, i) => (
              <li key={`${row.at}-${i}`} className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <span className="text-slate-700 truncate">{row.message}</span>
                <span className="text-slate-400 font-mono text-xs shrink-0">{row.path}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
