import { useOutletContext } from 'react-router-dom';
import { LogIn, UserPlus, Users } from 'lucide-react';
import { AreaChart, DonutChart, MetricCard, PageIntro, Panel, ProgressList, DayStrip } from '../../components/super/SuperCharts';

export default function SuperAudience() {
  const { analysis } = useOutletContext();
  const audience = analysis?.audience || {};
  const devices = audience.devices || {};
  const browsers = audience.browsers || {};
  const plan = audience.byPlan || {};

  return (
    <div>
      <PageIntro
        kicker="Pillar 4"
        title="Audience & acquisition"
        subtitle="Who is coming and how. New halls vs returning, school mix, device and browser. Segment — do not trust averages alone."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={UserPlus} label="New halls (7d)" value={audience.newHalls7d ?? 0} hint="Acquisition. If this drops, marketing is failing." />
        <MetricCard icon={Users} label="Returning halls" value={audience.returningHalls ?? 0} hint="Retention. A sharp drop means halls are not coming back." />
        <MetricCard accent icon={LogIn} label="Logins (7d)" value={audience.logins7d ?? 0} delta={audience.loginDelta} hint={`${audience.loginFails7d || 0} failed sign-ins`} />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
        <Panel title="Logins · last 14 days">
          <AreaChart data={audience.series || []} valueKey="logins" labelKey="label" />
        </Panel>
        <Panel title="Device split">
          <DonutChart
            centerLabel="Sessions"
            slices={[
              { label: 'Desktop', value: devices.desktop || 0, color: '#2563eb' },
              { label: 'Mobile', value: devices.mobile || 0, color: '#0f172a' },
            ]}
          />
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Panel>
          <DayStrip days={audience.weekStrip || []} countKey="views" />
        </Panel>
        <Panel title="Schools / geography">
          <ProgressList
            items={(audience.schools || []).map((s) => ({
              label: s.name,
              value: s.count,
              suffix: s.count,
            }))}
          />
        </Panel>
        <Panel title="Plan & browser">
          <DonutChart
            centerLabel="Halls"
            slices={[
              { label: 'Hall plan', value: plan.hall || 0, color: '#2563eb' },
              { label: 'SRC plan', value: plan.src || 0, color: '#0f172a' },
            ]}
          />
          <p className="text-xs text-slate-500 mt-4">
            Chrome {browsers.chrome || 0} · Safari {browsers.safari || 0} · Firefox {browsers.firefox || 0} · Edge {browsers.edge || 0}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {audience.presidents || 0} presidents · {audience.assistants || 0} assistants
          </p>
        </Panel>
      </div>
    </div>
  );
}
