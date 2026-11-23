'use client';

import {
  SAMPLE_CONTRIBUTION_EVENTS,
  buildContributionPerformanceProfile,
} from '@/lib/contribution-performance';

export default function ContributionPerformanceProfiler() {
  const profile = buildContributionPerformanceProfile(SAMPLE_CONTRIBUTION_EVENTS, 0.95);
  const metrics = [
    ['Cycle Time', `${profile.cycleTimeHours}h`],
    ['Review Response', `${profile.reviewResponseHours}h`],
    ['Overall Score', `${profile.overallScore}/100`],
  ];

  return (
    <section className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <div className="mb-6">
        <p className="text-text-secondary mb-2 text-xs font-bold tracking-widest uppercase">
          Open Source Contribution Trainer
        </p>
        <h2 className="text-foreground text-2xl font-black tracking-tight uppercase">
          Performance Profiling
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-text-secondary text-[10px] font-bold tracking-widest uppercase">
              {label}
            </p>
            <p className="text-foreground mt-2 font-mono text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-foreground mb-3 text-sm font-black uppercase">Recommendations</h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            {profile.recommendations.map((item) => (
              <li key={item} className="rounded-lg border border-white/10 bg-black/20 p-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-foreground mb-3 text-sm font-black uppercase">Bottlenecks</h3>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-text-secondary">
            {profile.bottlenecks.length > 0 ? profile.bottlenecks.join(', ') : 'No active bottlenecks detected.'}
          </div>
        </div>
      </div>
    </section>
  );
}
