import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Progress } from '@/components/ui/Progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityType = 'CourseCompletion' | 'PeerReview' | 'ContributionMerged' | 'AttendedEvent' | 'HackathonWin';

interface ScoreBreakdown {
  activity: ActivityType;
  basePoints: number;
  weightedPoints: number;
  timestamp: string;
}

interface DecayEntry {
  timestamp: string;
  scoreBefore: number;
  scoreAfter: number;
  decayAmount: number;
}

interface Attestation {
  attester: string;
  weight: number;
  timestamp: string;
  verified: boolean;
}

interface ReputationData {
  address: string;
  score: number;
  rawScore: number;
  activityCount: number;
  streakDays: number;
  breakdown: ScoreBreakdown[];
  decayHistory: DecayEntry[];
  attestations: Attestation[];
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const ACTIVITY_WEIGHTS: Record<ActivityType, number> = {
  CourseCompletion: 2,
  ContributionMerged: 3,
  HackathonWin: 5,
  PeerReview: 1.5,
  AttendedEvent: 1,
};

const MOCK: ReputationData = {
  address: 'GABC...1234',
  score: 1840,
  rawScore: 2100,
  activityCount: 14,
  streakDays: 32,
  breakdown: [
    { activity: 'HackathonWin', basePoints: 200, weightedPoints: 1000, timestamp: '2026-04-28' },
    { activity: 'ContributionMerged', basePoints: 100, weightedPoints: 300, timestamp: '2026-04-27' },
    { activity: 'CourseCompletion', basePoints: 100, weightedPoints: 200, timestamp: '2026-04-26' },
    { activity: 'PeerReview', basePoints: 80, weightedPoints: 120, timestamp: '2026-04-25' },
    { activity: 'AttendedEvent', basePoints: 50, weightedPoints: 50, timestamp: '2026-04-24' },
  ],
  decayHistory: [
    { timestamp: '2026-04-29', scoreBefore: 2100, scoreAfter: 1890, decayAmount: 210 },
    { timestamp: '2026-04-22', scoreBefore: 1950, scoreAfter: 1755, decayAmount: 195 },
  ],
  attestations: [
    { attester: 'GXYZ...AAAA', weight: 90, timestamp: '2026-04-28', verified: true },
    { attester: 'GDEF...BBBB', weight: 70, timestamp: '2026-04-27', verified: true },
    { attester: 'GHIJ...CCCC', weight: 50, timestamp: '2026-04-26', verified: false },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function activityColor(a: ActivityType): 'default' | 'secondary' | 'outline' {
  if (a === 'HackathonWin' || a === 'ContributionMerged') return 'default';
  if (a === 'CourseCompletion') return 'secondary';
  return 'outline';
}

function scoreLevel(score: number): { label: string; color: string } {
  if (score >= 2000) return { label: 'Elite', color: 'text-purple-600' };
  if (score >= 1000) return { label: 'Advanced', color: 'text-blue-600' };
  if (score >= 500)  return { label: 'Intermediate', color: 'text-green-600' };
  return { label: 'Beginner', color: 'text-gray-500' };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreCard({ data }: { data: ReputationData }) {
  const level = scoreLevel(data.score);
  const decayPct = Math.round(((data.rawScore - data.score) / data.rawScore) * 100);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-4xl font-bold">{data.score.toLocaleString()}</p>
            <p className={`text-sm font-medium ${level.color}`}>{level.label}</p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-sm text-muted-foreground">Raw: {data.rawScore.toLocaleString()}</p>
            <Badge variant="secondary">🔥 {data.streakDays}-day streak</Badge>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Score after decay</span>
            <span className="text-red-500">−{decayPct}% decayed</span>
          </div>
          <Progress value={Math.round((data.score / data.rawScore) * 100)} className="h-2" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <p className="font-semibold">{data.activityCount}</p>
            <p className="text-xs text-muted-foreground">Activities</p>
          </div>
          <div>
            <p className="font-semibold">{data.attestations.filter(a => a.verified).length}</p>
            <p className="text-xs text-muted-foreground">Attestations</p>
          </div>
          <div>
            <p className="font-semibold">{data.decayHistory.length}</p>
            <p className="text-xs text-muted-foreground">Decay events</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownTab({ breakdown }: { breakdown: ScoreBreakdown[] }) {
  return (
    <div className="space-y-2">
      {breakdown.map((b, i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Badge variant={activityColor(b.activity)}>{b.activity}</Badge>
              <span className="text-xs text-muted-foreground">{b.timestamp}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {b.basePoints} pts × {ACTIVITY_WEIGHTS[b.activity]}× weight
            </p>
          </div>
          <span className="font-semibold text-green-600">+{b.weightedPoints}</span>
        </div>
      ))}
    </div>
  );
}

function DecayTab({ history }: { history: DecayEntry[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No decay events yet.</p>;
  }
  return (
    <div className="space-y-2">
      {history.map((d, i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{d.timestamp}</p>
            <p>{d.scoreBefore.toLocaleString()} → {d.scoreAfter.toLocaleString()}</p>
          </div>
          <Badge variant="destructive">−{d.decayAmount}</Badge>
        </div>
      ))}
    </div>
  );
}

function AttestationsTab({
  attestations,
  onAttest,
}: {
  attestations: Attestation[];
  onAttest: (weight: number) => void;
}) {
  const [weight, setWeight] = useState('70');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Submit Attestation</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Weight (1–100)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full border rounded px-3 py-1.5 text-sm"
              aria-label="Attestation weight"
            />
          </div>
          <Button
            size="sm"
            className="mt-5"
            onClick={() => onAttest(parseInt(weight))}
            disabled={!weight || parseInt(weight) < 1 || parseInt(weight) > 100}
          >
            Attest
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {attestations.map((a, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
            <div>
              <p className="font-mono text-xs">{a.attester}</p>
              <p className="text-xs text-muted-foreground">{a.timestamp}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">Weight: {a.weight}</span>
              <Badge variant={a.verified ? 'default' : 'secondary'}>
                {a.verified ? '✓ Verified' : 'Pending'}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsTab({ data }: { data: ReputationData }) {
  const totalWeighted = data.breakdown.reduce((s, b) => s + b.weightedPoints, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Score Composition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.breakdown.map((b, i) => {
            const pct = Math.round((b.weightedPoints / totalWeighted) * 100);
            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{b.activity}</span>
                  <span>{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Decay Rate</AlertTitle>
        <AlertDescription>
          Your score decays at ~0.5% per day of inactivity. Stay active to maintain your rank.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function ReputationDashboard() {
  const [data, setData] = useState<ReputationData>(MOCK);
  const [tab, setTab] = useState('breakdown');

  function handleAttest(weight: number) {
    const entry: Attestation = {
      attester: 'GSELF...YOU',
      weight,
      timestamp: new Date().toISOString().slice(0, 10),
      verified: false,
    };
    setData((d) => ({ ...d, attestations: [entry, ...d.attestations] }));
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reputation</h1>
          <p className="text-sm font-mono text-muted-foreground">{data.address}</p>
        </div>
        <Badge variant="outline">On-chain</Badge>
      </div>

      <ScoreCard data={data} />

      <Tabs>
        <TabsList>
          <TabsTrigger value="breakdown" onClick={() => setTab('breakdown')}>Breakdown</TabsTrigger>
          <TabsTrigger value="decay" onClick={() => setTab('decay')}>Decay</TabsTrigger>
          <TabsTrigger value="attestations" onClick={() => setTab('attestations')}>Attestations</TabsTrigger>
          <TabsTrigger value="analytics" onClick={() => setTab('analytics')}>Analytics</TabsTrigger>
        </TabsList>

        {tab === 'breakdown' && (
          <TabsContent value="breakdown">
            <Card><CardContent className="pt-4"><BreakdownTab breakdown={data.breakdown} /></CardContent></Card>
          </TabsContent>
        )}
        {tab === 'decay' && (
          <TabsContent value="decay">
            <Card><CardContent className="pt-4"><DecayTab history={data.decayHistory} /></CardContent></Card>
          </TabsContent>
        )}
        {tab === 'attestations' && (
          <TabsContent value="attestations">
            <AttestationsTab attestations={data.attestations} onAttest={handleAttest} />
          </TabsContent>
        )}
        {tab === 'analytics' && (
          <TabsContent value="analytics">
            <AnalyticsTab data={data} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default ReputationDashboard;
