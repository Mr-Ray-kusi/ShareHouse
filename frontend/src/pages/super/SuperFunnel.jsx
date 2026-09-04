import { useOutletContext } from 'react-router-dom';
import { BadgePercent, Coins, PackageCheck } from 'lucide-react';
import { AreaChart, DonutChart, MetricCard, PageIntro, Panel, DayStrip } from '../../components/super/SuperCharts';

export default function SuperFunnel() {
  const { analysis } = useOutletContext();
  const funnel = analysis?.funnel || {};
  const maxStage = Math.max(1, ...(funnel.stages || []).map((s) => s.value || 0));

  return (
    <div>
      <PageIntro
        kicker="Pillar 3"
        title="Business funnel"
        subtitle="Register → pay → upload list → first collection. Watch drop-off and conversion rate, not just totals. Payment drop-off is usually trust or Paystack."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={BadgePercent} label="Overall conversion" value={`${funnel.overallConversion || 0}%`} delta={funnel.conversionDelta} hint="Halls that collected ÷ registered" />
        <MetricCard icon={PackageCheck} label="Collected today" value={funnel.collectionsToday ?? 0} hint={`${funnel.pendingNow || 0} still pending on active lists`} />
        <MetricCard accent icon={Coins} label="Revenue" value={`GHS ${funnel.revenue ?? 0}`} hint={`AOV GHS ${funnel.aov || 0} per paying hall`} />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
        <Panel title="Collections · last 14 days">
          <AreaChart data={funnel.series || []} valueKey="collections" labelKey="label" />
        </Panel>
        <Panel title="List completion">
          <DonutChart
            centerLabel="People"
            slices={[
              { label: 'Received', value: funnel.receivedNow || 0, color: '#2563eb' },
              { label: 'Pending', value: funnel.pendingNow || 0, color: '#0f172a' },
            ]}
          />
        </Panel>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4 mt-4">
        <Panel title="Funnel drop-off">
          <div className="space-y-4">
            {(funnel.stages || []).map((stage, i, arr) => {
              const next = arr[i + 1];
              const drop = next ? Math.max(0, (stage.value || 0) - (next.value || 0)) : 0;
              const width = Math.round(((stage.value || 0) / maxStage) * 100);
              return (
                <div key={stage.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-600">{stage.name}</span>
                    <span className="font-semibold">{stage.value || 0}{next ? ` · −${drop} drop` : ''}</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Register to pay {funnel.registerToPay || 0}% · Pay to list {funnel.payToList || 0}% · List to collect {funnel.listToCollect || 0}%
          </p>
        </Panel>
        <Panel>
          <DayStrip days={funnel.weekStrip || []} countKey="collections" />
          <p className="text-xs text-slate-400 mt-3">Collections per day this week.</p>
        </Panel>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mt-4">
        <MetricCard label="Registered" value={funnel.registered ?? 0} />
        <MetricCard label="Paid" value={funnel.paid ?? 0} hint={`${funnel.registerToPay || 0}% of registered`} />
        <MetricCard label="Uploaded a list" value={funnel.hallsWithList ?? 0} hint={`${funnel.payToList || 0}% of paid`} />
        <MetricCard label="Started collecting" value={funnel.hallsWithCollection ?? 0} hint={`${funnel.listToCollect || 0}% of lists`} />
      </div>
    </div>
  );
}
