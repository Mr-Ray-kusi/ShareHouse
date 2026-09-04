import { useOutletContext } from 'react-router-dom';
import { Eye, Search, Sparkles } from 'lucide-react';
import { AreaChart, DonutChart, MetricCard, PageIntro, Panel, ProgressList, DayStrip } from '../../components/super/SuperCharts';

export default function SuperBehaviour() {
  const { analysis } = useOutletContext();
  const behavior = analysis?.behavior || {};
  const top = (behavior.topPaths || []).slice(0, 3);

  return (
    <div>
      <PageIntro
        kicker="Pillar 2"
        title="User behaviour"
        subtitle="Are presidents and assistants finding what they need? Watch engagement, screen flow, and desk search — not raw pageviews."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={Sparkles} label="Engagement rate" value={behavior.engagementRate != null ? `${behavior.engagementRate}%` : '—'} hint="Users who go deeper than a glance" />
        <MetricCard icon={Search} label="Desk searches" value={behavior.searchCount ?? 0} hint="Internal name / ID search · 7 days" />
        <MetricCard accent icon={Eye} label="Screen views" value={behavior.pageViews ?? 0} delta={behavior.pageViewDelta} hint="Since last week · used for flow, not as a goal" />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
        <Panel title="Screen views · last 14 days">
          <AreaChart data={behavior.series || []} valueKey="views" labelKey="label" />
        </Panel>
        <Panel title="Where they go">
          <DonutChart
            centerLabel="Views"
            slices={[
              { label: top[0]?.path || 'Live desk', value: top[0]?.count || 0, color: '#2563eb' },
              { label: top[1]?.path || 'Collect', value: top[1]?.count || 0, color: '#0f172a' },
              { label: top[2]?.path || 'Other', value: top[2]?.count || 0, color: '#cbd5e1' },
            ]}
          />
        </Panel>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4 mt-4">
        <Panel>
          <DayStrip days={behavior.weekStrip || []} countKey="views" />
          <p className="text-xs text-slate-400 mt-3">Views per day. If people bounce off login or never reach collect, the week goes quiet.</p>
        </Panel>
        <Panel title="Search terms">
          <ProgressList
            items={(behavior.topSearches || []).map((s) => ({
              label: s.term,
              value: s.count,
              suffix: s.count,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Path exploration" className="mt-4">
        <ProgressList
          items={(behavior.topPaths || []).map((p) => ({
            label: p.path,
            value: p.count,
            suffix: p.count,
          }))}
        />
      </Panel>
    </div>
  );
}
