"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";

// ── Types ──────────────────────────────────────────────────────────────────

type JobStatus = "Open" | "InProgress" | "Completed" | "Disputed" | "Cancelled";
type MilestoneStatus = "Pending" | "Submitted" | "Approved" | "Disputed";
type SkillLevel = "Beginner" | "Intermediate" | "Advanced" | "Expert";

interface Milestone {
  description: string;
  payment: number;
  status: MilestoneStatus;
}

interface Job {
  id: number;
  employer: string;
  title: string;
  budget: number;
  escrowed: number;
  requiredSkills: string[];
  milestones: Milestone[];
  applicant: string | null;
  status: JobStatus;
  deadline: number; // ledger
}

interface SkillAttestation {
  skill: string;
  level: SkillLevel;
  score: number;
  expiresAt: number;
}

interface SkillProfile {
  owner: string;
  attestations: SkillAttestation[];
  badges: string[];
}

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_JOBS: Job[] = [
  {
    id: 0,
    employer: "GBOSS...1234",
    title: "Soroban Smart Contract Dev",
    budget: 5000,
    escrowed: 5000,
    requiredSkills: ["Rust", "Soroban", "Blockchain"],
    milestones: [
      { description: "Contract design", payment: 1000, status: "Approved" },
      { description: "Implementation", payment: 3000, status: "Submitted" },
      { description: "Testing & audit", payment: 1000, status: "Pending" },
    ],
    applicant: "GWORK...5678",
    status: "InProgress",
    deadline: 1_200_000,
  },
  {
    id: 1,
    employer: "GBOSS...ABCD",
    title: "Frontend Web3 Integration",
    budget: 2000,
    escrowed: 2000,
    requiredSkills: ["React", "TypeScript", "Stellar SDK"],
    milestones: [
      { description: "UI mockups", payment: 500, status: "Pending" },
      { description: "Integration", payment: 1500, status: "Pending" },
    ],
    applicant: null,
    status: "Open",
    deadline: 1_300_000,
  },
  {
    id: 2,
    employer: "GBOSS...EFGH",
    title: "DeFi Protocol Audit",
    budget: 8000,
    escrowed: 0,
    requiredSkills: ["Security", "Rust", "Soroban"],
    milestones: [
      { description: "Static analysis", payment: 3000, status: "Approved" },
      { description: "Dynamic testing", payment: 3000, status: "Approved" },
      { description: "Report", payment: 2000, status: "Approved" },
    ],
    applicant: "GWORK...9999",
    status: "Completed",
    deadline: 1_100_000,
  },
];

const MOCK_PROFILE: SkillProfile = {
  owner: "GWORK...5678",
  attestations: [
    { skill: "Rust", level: "Advanced", score: 88, expiresAt: 2_000_000 },
    { skill: "Soroban", level: "Intermediate", score: 75, expiresAt: 2_000_000 },
    { skill: "React", level: "Expert", score: 95, expiresAt: 2_000_000 },
    { skill: "TypeScript", level: "Advanced", score: 82, expiresAt: 2_000_000 },
  ],
  badges: ["Rust", "React", "TypeScript"],
};

const CURRENT_LEDGER = 1_150_000;

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<JobStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Open: "default",
  InProgress: "secondary",
  Completed: "outline",
  Disputed: "destructive",
  Cancelled: "destructive",
};

const MS_VARIANT: Record<MilestoneStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Pending: "outline",
  Submitted: "secondary",
  Approved: "default",
  Disputed: "destructive",
};

function milestoneProgress(milestones: Milestone[]): number {
  const approved = milestones.filter((m) => m.status === "Approved").length;
  return Math.round((approved / milestones.length) * 100);
}

function ledgersToLabel(ledger: number): string {
  const diff = ledger - CURRENT_LEDGER;
  if (diff <= 0) return "Expired";
  const hours = Math.round((diff * 5) / 3600);
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function JobCard({
  job,
  onApply,
  onSelect,
}: {
  job: Job;
  onApply: (id: number) => void;
  onSelect: (job: Job) => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onSelect(job)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{job.title}</CardTitle>
          <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
        </div>
        <CardDescription className="text-xs">{job.employer}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {job.requiredSkills.map((s) => (
            <Badge key={s} variant="outline" className="text-xs">
              {s}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{job.budget.toLocaleString()} XLM</span>
          <span className="text-muted-foreground">{ledgersToLabel(job.deadline)}</span>
        </div>
        {job.status === "InProgress" && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Progress: {milestoneProgress(job.milestones)}%
            </p>
            <Progress value={milestoneProgress(job.milestones)} />
          </div>
        )}
        {job.status === "Open" && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onApply(job.id);
            }}
          >
            Apply
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function JobDetail({
  job,
  onSubmitMilestone,
  onApproveMilestone,
  onDispute,
}: {
  job: Job;
  onSubmitMilestone: (jobId: number, idx: number) => void;
  onApproveMilestone: (jobId: number, idx: number) => void;
  onDispute: (jobId: number, idx: number) => void;
}) {
  const escrowed = job.escrowed;
  const paid = job.budget - escrowed;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{job.title}</h2>
        <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Employer</p>
          <p className="font-mono text-xs">{job.employer}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Worker</p>
          <p className="font-mono text-xs">{job.applicant ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Budget</p>
          <p className="font-semibold">{job.budget.toLocaleString()} XLM</p>
        </div>
        <div>
          <p className="text-muted-foreground">Escrowed</p>
          <p className="font-semibold">{escrowed.toLocaleString()} XLM</p>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">
          Paid out: {paid.toLocaleString()} / {job.budget.toLocaleString()} XLM
        </p>
        <Progress value={Math.round((paid / job.budget) * 100)} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Required Skills</h3>
        <div className="flex flex-wrap gap-1">
          {job.requiredSkills.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Milestones</h3>
        <div className="space-y-2">
          {job.milestones.map((ms, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{ms.description}</p>
                <p className="text-xs text-muted-foreground">
                  {ms.payment.toLocaleString()} XLM
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={MS_VARIANT[ms.status]}>{ms.status}</Badge>
                {ms.status === "Pending" && job.applicant && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSubmitMilestone(job.id, i)}
                  >
                    Submit
                  </Button>
                )}
                {ms.status === "Submitted" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => onApproveMilestone(job.id, i)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDispute(job.id, i)}
                    >
                      Dispute
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkillProfilePanel({ profile }: { profile: SkillProfile }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Verified Badges</h3>
        <div className="flex flex-wrap gap-2">
          {profile.badges.map((b) => (
            <Badge key={b} className="gap-1">
              ✓ {b}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Attestations</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Skill</th>
                <th className="px-4 py-2 text-left">Level</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-right">Expires</th>
              </tr>
            </thead>
            <tbody>
              {profile.attestations.map((a, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2 font-medium">{a.skill}</td>
                  <td className="px-4 py-2">
                    <Badge variant="secondary">{a.level}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={
                        a.score >= 70 ? "text-green-600 font-semibold" : "text-destructive"
                      }
                    >
                      {a.score}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                    {ledgersToLabel(a.expiresAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function JobBoard() {
  const [tab, setTab] = useState("browse");
  const [jobs, setJobs] = useState<Job[]>(MOCK_JOBS);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleApply = useCallback(
    (jobId: number) => {
      notify(`Applied to job #${jobId}`);
    },
    []
  );

  const handleSubmitMilestone = useCallback(
    (jobId: number, idx: number) => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== jobId) return j;
          const milestones = j.milestones.map((m, i) =>
            i === idx ? { ...m, status: "Submitted" as MilestoneStatus } : m
          );
          return { ...j, milestones };
        })
      );
      setSelectedJob((prev) => {
        if (!prev || prev.id !== jobId) return prev;
        const milestones = prev.milestones.map((m, i) =>
          i === idx ? { ...m, status: "Submitted" as MilestoneStatus } : m
        );
        return { ...prev, milestones };
      });
      notify(`Milestone ${idx + 1} submitted`);
    },
    []
  );

  const handleApproveMilestone = useCallback(
    (jobId: number, idx: number) => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== jobId) return j;
          const milestones = j.milestones.map((m, i) =>
            i === idx ? { ...m, status: "Approved" as MilestoneStatus } : m
          );
          const allDone = milestones.every((m) => m.status === "Approved");
          const paid = milestones
            .filter((m) => m.status === "Approved")
            .reduce((s, m) => s + m.payment, 0);
          return {
            ...j,
            milestones,
            escrowed: j.budget - paid,
            status: allDone ? ("Completed" as JobStatus) : j.status,
          };
        })
      );
      setSelectedJob((prev) => {
        if (!prev || prev.id !== jobId) return prev;
        const milestones = prev.milestones.map((m, i) =>
          i === idx ? { ...m, status: "Approved" as MilestoneStatus } : m
        );
        const allDone = milestones.every((m) => m.status === "Approved");
        const paid = milestones
          .filter((m) => m.status === "Approved")
          .reduce((s, m) => s + m.payment, 0);
        return {
          ...prev,
          milestones,
          escrowed: prev.budget - paid,
          status: allDone ? ("Completed" as JobStatus) : prev.status,
        };
      });
      notify(`Milestone ${idx + 1} approved — payment released`);
    },
    []
  );

  const handleDispute = useCallback(
    (jobId: number, idx: number) => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== jobId) return j;
          const milestones = j.milestones.map((m, i) =>
            i === idx ? { ...m, status: "Disputed" as MilestoneStatus } : m
          );
          return { ...j, milestones, status: "Disputed" as JobStatus };
        })
      );
      setSelectedJob((prev) => {
        if (!prev || prev.id !== jobId) return prev;
        const milestones = prev.milestones.map((m, i) =>
          i === idx ? { ...m, status: "Disputed" as MilestoneStatus } : m
        );
        return { ...prev, milestones, status: "Disputed" as JobStatus };
      });
      notify(`Dispute opened on milestone ${idx + 1}`);
    },
    []
  );

  const openJobs = jobs.filter((j) => j.status === "Open");
  const activeJobs = jobs.filter((j) => j.status === "InProgress" || j.status === "Disputed");
  const completedJobs = jobs.filter((j) => j.status === "Completed");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Job Board</h1>
        <p className="text-muted-foreground">
          Decentralized jobs with on-chain skill verification and escrow payments.
        </p>
      </div>

      {toast && (
        <Alert>
          <AlertTitle>✓</AlertTitle>
          <AlertDescription>{toast}</AlertDescription>
        </Alert>
      )}

      <Tabs>
        <TabsList>
          {["browse", "active", "profile"].map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              data-state={tab === t ? "active" : "inactive"}
              onClick={() => {
                setTab(t);
                setSelectedJob(null);
              }}
            >
              {t === "browse"
                ? `Browse (${openJobs.length})`
                : t === "active"
                ? `Active (${activeJobs.length})`
                : "My Skills"}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Browse tab */}
        <TabsContent value="browse" className={tab !== "browse" ? "hidden" : ""}>
          {selectedJob ? (
            <div className="mt-4 space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedJob(null)}>
                ← Back
              </Button>
              <JobDetail
                job={selectedJob}
                onSubmitMilestone={handleSubmitMilestone}
                onApproveMilestone={handleApproveMilestone}
                onDispute={handleDispute}
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {openJobs.length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground">
                  No open jobs right now.
                </p>
              )}
              {openJobs.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  onApply={handleApply}
                  onSelect={setSelectedJob}
                />
              ))}
              {completedJobs.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  onApply={handleApply}
                  onSelect={setSelectedJob}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Active tab */}
        <TabsContent value="active" className={tab !== "active" ? "hidden" : ""}>
          {selectedJob ? (
            <div className="mt-4 space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedJob(null)}>
                ← Back
              </Button>
              <JobDetail
                job={selectedJob}
                onSubmitMilestone={handleSubmitMilestone}
                onApproveMilestone={handleApproveMilestone}
                onDispute={handleDispute}
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {activeJobs.length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground">
                  No active jobs.
                </p>
              )}
              {activeJobs.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  onApply={handleApply}
                  onSelect={setSelectedJob}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Skills tab */}
        <TabsContent value="profile" className={tab !== "profile" ? "hidden" : ""}>
          <div className="mt-4">
            <SkillProfilePanel profile={MOCK_PROFILE} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
