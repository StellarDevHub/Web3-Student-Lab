import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Alert } from '@/components/ui/Alert';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityType =
  | 'CourseCompletion'
  | 'PeerReview'
  | 'Attestation'
  | 'OpenSourceContribution'
  | 'HackathonParticipation'
  | 'DailyEngagement';

interface ScoreBreakdown {
  activity: ActivityType;
  points: number;
  ledger: number;
  timestamp: string;
}

interface Attestation {
  attester: string;
  weight: number;
  ledger: number;
  timestamp: string;
}

interface ReputationData {
  address: string;
  effectiveScore: number;
  rawScore: number;
  streakDays: number;
  attestationCount: number;
  lastActivityLedger: number;
  breakdown: ScoreBreakdown[];
  attestations: Attestation[];
}

// ---------------------------------------------------------------------------
// Mock data (replace with contract calls)
// ---------------------------------------------------------------------------

const MOCK: ReputationData = {
  address: 'GABC...1234',
  effectiveScore: 1_842_000,
  rawScore: 2_100_000,
  streakDays: 12,
  attestationCount: 3,
  lastActivityLedger: 4_980_000,
  breakdown: [
    { activity: 'CourseCompletion', points: 625_000, ledger: 4_980_000, timestamp: '2026-04-29' },
    { activity: 'PeerReview', points: 125_000, ledger: 4_960_000, timestamp: '2026-04-27' },
    { activity: 'OpenSourceContribution', points: 375_000, ledger: 4_940_000, timestamp: '2026-04-25' },
    { activity: 'DailyEngagement', points: 12_500, ledger: 4_920_000, timestamp: '2026-04-23' },
  ],
  attestations: [
    { attester: 'GDEF...5678', weight: 75_000, ledger: 4_970_000, timestamp: '2026-04-28' },
    { attester: 'GHIJ...9012', weight: 50_000, ledger: 4_950_000, timestamp: '2026-04-26' },
    { attester: 'GKLM...3456', weight: 60_000, ledger: 4_930_000, timestamp: '2026-04-24' },
  ],
};

const PRECISION = 1_000_000;
const MAX_DISPLAY_SCORE = 5_000 * PRECISION;

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CourseCompletion: 'Course Completion',
  PeerReview: 'Peer Review',
  Attestation: 'Attestation',
  OpenSourceContribution: 'Open Source',
  HackathonParticipation: 'Hackathon',
  DailyEngagement: 'Daily Engagement',
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  CourseCompletion: 'bg-blue-500',
  PeerReview: 'bg-purple-500',
  Attestation: 'bg-green-500',
  OpenSourceContribution: 'bg-orange-500',
  HackathonParticipation: 'bg-pink-500',
  DailyEngagement: 'bg-gray-400',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatScore(score: number): string {
  return (score / PRECISION).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function decayPercent(raw: number, effective: number): number {
  if (raw === 0) return 0;
  return Math.round(((raw - effective) / raw) * 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreGauge({ score, max }: { score: number; max: number }) {
  const pct = Math.min(Math.round((score / max) * 100), 100);
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <span className="text-4xl font-bold tabular-nums">{formatScore(score)}</span>
        <span className="text-sm text-muted-foreground">/ {formatScore(max)} max</span>
      </div>
      <Progress value={pct} className="h-3" />
      <p className="text-xs text-muted-foreground">{pct}% of maximum score</p>
    </div>
  );
}

function BreakdownRow({ item }: { item: ScoreBreakdown }) {
  return (
    <div className="flex items-center gap-3 border-b py-2 last:border-0">
      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${ACTIVITY_COLORS[item.activity]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{ACTIVITY_LABELS[item.activity]}</p>
        <p className="text-xs text-muted-foreground">{item.timestamp}</p>
      </div>
      <span className="text-sm font-semibold tabular-nums">+{formatScore(item.points)}</span>
    </div>
  );
}

function AttestationRow({ att }: { att: Attestation }) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs">{att.attester}</p>
        <p className="text-xs text-muted-foreground">{att.timestamp}</p>
      </div>
      <Badge variant="secondary" className="ml-3 flex-shrink-0 tabular-nums">
        +{formatScore(att.weight)} pts
      </Badge>
    </div>
  );
}

function AttestForm({ onAttest }: { onAttest: (subject: string) => void }) {
  const [subject, setSubject] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (subject.trim()) { onAttest(subject.trim()); setSubject(''); }
      }}
    >
      <input
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Address to endorse (G...)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        aria-label="Address to endorse"
      />
      <Button type="submit" disabled={!subject.trim()}>Endorse</Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function ReputationDashboard() {
  const [data] = useState<ReputationData>(MOCK);
  const [activeTab, setActiveTab] = useState('overview');
  const [notice, setNotice] = useState<string | null>(null);

  const decay = decayPercent(data.rawScore, data.effectiveScore);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleAttest = (subject: string) => {
    showNotice(`Endorsement submitted for ${subject}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reputation</h1>
          <p className="font-mono text-sm text-muted-foreground">{data.address}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.streakDays >= 7 ? 'default' : 'outline'}>
            🔥 {data.streakDays}-day streak
          </Badge>
          <Badge variant="secondary">{data.attestationCount} endorsements</Badge>
        </div>
      </div>

      {notice && <Alert variant="default">{notice}</Alert>}

      {/* Score card */}
      <Card>
        <CardHeader>
          <CardTitle>Effective Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScoreGauge score={data.effectiveScore} max={MAX_DISPLAY_SCORE} />
          {decay > 0 && (
            <p className="text-xs text-muted-foreground">
              Raw score: {formatScore(data.rawScore)} — {decay}% decayed due to inactivity
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Effective', value: formatScore(data.effectiveScore) },
          { label: 'Raw', value: formatScore(data.rawScore) },
          { label: 'Streak', value: `${data.streakDays}d` },
          { label: 'Endorsements', value: data.attestationCount },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs>
        <TabsList className="w-full justify-start">
          {['overview', 'breakdown', 'attestations'].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              data-state={activeTab === tab ? 'active' : 'inactive'}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" hidden={activeTab !== 'overview'}>
          <Card>
            <CardHeader><CardTitle>Score Composition</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* Activity type bar chart */}
              {Object.entries(ACTIVITY_LABELS).map(([key, label]) => {
                const total = data.breakdown
                  .filter((b) => b.activity === key)
                  .reduce((s, b) => s + b.points, 0);
                if (total === 0) return null;
                const pct = Math.round((total / data.rawScore) * 100);
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{label}</span>
                      <span className="tabular-nums">{formatScore(total)} pts ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${ACTIVITY_COLORS[key as ActivityType]}`}
                        style={{ width: `${pct}%` }}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breakdown */}
        <TabsContent value="breakdown" hidden={activeTab !== 'breakdown'}>
          <Card>
            <CardHeader><CardTitle>Activity History</CardTitle></CardHeader>
            <CardContent>
              {data.breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                data.breakdown.map((item, i) => <BreakdownRow key={i} item={item} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attestations */}
        <TabsContent value="attestations" hidden={activeTab !== 'attestations'}>
          <Card>
            <CardHeader><CardTitle>Endorsements</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <AttestForm onAttest={handleAttest} />
              {data.attestations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No endorsements received yet.</p>
              ) : (
                data.attestations.map((att, i) => <AttestationRow key={i} att={att} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ReputationDashboard;
