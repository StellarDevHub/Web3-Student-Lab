# Web3 Student Lab 🎓⛓️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)

**Web3 Student Lab** is an open-source educational platform that helps students learn blockchain, smart contracts, open-source collaboration, and hackathon project development in one place.

The platform provides **interactive tools, coding environments, and guided learning paths** designed for beginners and university students.

## 🟢 Live Deployment

The application is fully deployed and accessible online:

- **Frontend Application**: [https://web3-student-lab.vercel.app/](https://web3-student-lab.vercel.app/)
- **Backend Infrastructure**: Hosted securely on Render using PostgreSQL, Redis, and integrated with the Stellar/Soroban Testnet.
- **Smart Contracts**: My contract is deployed!

## 🚀 Core Modules

1. **Blockchain Learning Simulator**: Visually learn how blockchains work (create transactions, mine
   blocks, view hashes, and see how blocks connect).
2. **Smart Contract Playground**: Write, run, and test smart contracts directly in your browser.
   Focuses on Soroban contracts written in Rust.
3. **Web3 Learning Roadmap**: A guided path spanning programming fundamentals, cryptography,
   blockchain architecture, smart contracts, and full Web3 applications.
4. **Hackathon Project Idea Generator**: Overcome coder's block by generating ideas based on
   technology and sector preferences.
5. **Open Source Contribution Trainer**: Get hands-on with Git, simulated GitHub issues, PR
   exercises, and decentralized identity verification that attaches DID-backed contributor proof to
   saved training submissions.

## 🛠 Technology Stack

**Frontend**

- React / Next.js
- Tailwind CSS
- Monaco Editor
- WebAuthn API (Passkeys)

**Backend**

- Node.js / Express
- PostgreSQL
- Redis (Challenge Storage)

**Blockchain Integration**

- Stellar SDK
- Soroban Smart Contracts
- Soroban Rust SDK `26.1.0` for every contract crate and browser-generated Cargo manifest

## 📁 Repository Structure

```text
web3-student-lab/
├── contracts/            # Soroban Cargo workspace (see docs/contracts/WORKSPACE.md)
├── frontend/             # Next.js/React frontend application
├── backend/              # Node.js backend application
├── scripts/              # Development automation scripts and test payloads
└── docs/                 # Documentation and learning materials
```

### ⚡ Development Automation Scripts (`scripts/`)

All automated generators, environment setup scripts, and payload tooling reside in `scripts/`:

| Script / Artifact | Description | Usage |
| ----------------- | ----------- | ----- |
| `scripts/generate_issues.py` | Generates structured Markdown issue sets (`70_new_issues.md`) | `python3 scripts/generate_issues.py` |
| `scripts/generate_gh_payload.py` | Generates GitHub REST API issue payloads (`github_issues_payload.json`) | `python3 scripts/generate_gh_payload.py` |
| `scripts/setup-local-node.sh` | Spins up local Stellar/Soroban standalone node | `bash scripts/setup-local-node.sh` |
| `scripts/deploy-subscription-system.sh` | Deploys Soroban subscription system contracts | `bash scripts/deploy-subscription-system.sh` |

## 👥 Local Development

### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose (for PostgreSQL/Redis)
- Rust toolchain (for smart contracts)
- Stellar CLI

### Infrastructure (Docker Compose)

Most day-to-day work only needs **PostgreSQL + standalone Redis**. Prefer the development override so Sentinel and Cluster nodes are not started:

```bash
# Recommended for development (PostgreSQL + standalone Redis only)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Other compose profiles:

```bash
# Full stack (PostgreSQL, Redis, Sentinels, Cluster, backend) — production-like testing
docker compose -f docker-compose.yml up -d

# High-availability Redis testing (Sentinel / Cluster wired for the backend)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Full stack: Postgres, Redis, Sentinels, Cluster, backend |
| `docker-compose.dev.yml` | Dev override: Postgres + standalone Redis only |
| `docker-compose.prod.yml` | HA override: Sentinel/Cluster-oriented backend config |

Stop services with `docker compose down` (pass the same `-f` flags you used to start).

## 🔐 MVP Update: Decentralized Identity Verification

The Open Source Contribution Trainer now includes decentralized identity verification for contributor
workflows in `frontend/src/app/version-control/page.tsx`.

- Contributors link a DID, Stellar wallet address, and GitHub handle before saving a verified
  trainer version.
- Verified saves persist proof metadata in the version history engine at
  `frontend/src/lib/version-control/engine.ts`.
- Core attestation creation and verification logic lives in
  `frontend/src/lib/open-source-trainer/identity.ts`.

## 🤝 Contributing

We love our contributors! This project is being built for students, by students and open-source enthusiasts.

To start contributing:

1. Read our [Contribution Guidelines](CONTRIBUTING.md).
2. Check out our existing [Issues](https://github.com/your-repo/issues) or look for the `good first issue` label.
3. Fork the repository and submit a Pull Request!

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
// Stellar Wave #1086, #1085, #1084, #1083

## Stellar Wave #1086-1083: Admin Panel Features

### #1086: Automated Assessment Builder
- Code syntax validation via isolated Web Worker sandbox
- Regex pattern matching for student submission evaluation
- Unit test runner with 2-second timeout enforcement
- Cryptographic score attestations for grading events
- Versioned assessment templates with backward-compatible criteria

### #1085: Soft-Delete & Curriculum Restoration
- Prisma soft-delete extensions filtering deletedAt across queries
- Snapshot archiving with JSONB state trees on update
- Admin restoration UI with version comparison and 1-click rollback
- Automatic hard-delete retention after 90-day archival window

### #1084: Tamper-Evident Audit Trail
- Merkle-chain hashing of all admin action records
- SHA-256 content hashing with previous hash linkage
- Immutable audit log stored in separate append-only table
- Tamper detection API returning chain validity status

### #1083: Student Retention Analytics
- Module completion rate tracking per student cohort
- Drop-off point identification in curriculum funnel
- Time-to-completion metrics with percentile breakdowns
- Exportable analytics reports in CSV and JSON formats

---

## Stellar Wave #1086: Automated Assessment & Code-Snippet Evaluation Builder

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Assessment Builder UI               │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ Template  │ │ Test Vector  │ │ Grading Rules    │ │
│  │ Editor    │ │ Manager      │ │ Configuration    │ │
│  └──────────┘ └──────────────┘ └──────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Web Worker Test Engine                   │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │ Sandbox    │ │ Regex       │ │ Unit Test      │  │
│  │ Executor   │ │ Matcher     │ │ Runner         │  │
│  └────────────┘ └─────────────┘ └────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Scoring & Attestation                    │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │ Partial    │ │ Time        │ │ Crypto         │  │
│  │ Credit     │ │ Penalty     │ │ Attestation    │  │
│  └────────────┘ └─────────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Implementation

#### 1. Assessment Template Versioning

```typescript
interface AssessmentTemplate {
  id: string;
  version: number;
  lessonId: string;
  title: string;
  description: string;
  testVectors: TestVector[];
  gradingRules: GradingRule[];
  timeLimitSeconds: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  previousVersionId: string | null;
}

interface TestVector {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  weight: number;
  regexPattern?: string;
  unitTestCode?: string;
  timeoutMs: number;
}

interface GradingRule {
  id: string;
  type: 'exact_match' | 'regex' | 'unit_test' | 'partial_credit';
  maxPoints: number;
  partialCreditTiers: PartialCreditTier[];
  timePenaltyPercent: number;
  hintPenaltyEnabled: boolean;
}

interface PartialCreditTier {
  minScorePercent: number;
  maxScorePercent: number;
  description: string;
}
```

#### 2. Web Worker Test Runner

```typescript
// assessment-worker.ts
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'EXECUTE_ASSESSMENT':
      await executeAssessment(payload);
      break;
    case 'VALIDATE_SYNTAX':
      await validateSyntax(payload);
      break;
    case 'RUN_REGEX_MATCH':
      await runRegexMatch(payload);
      break;
  }
};

async function executeAssessment(payload: ExecutionPayload) {
  const { studentCode, testVectors, timeoutMs } = payload;
  const results: TestResult[] = [];
  const startTime = performance.now();

  for (const vector of testVectors) {
    try {
      const output = await executeWithTimeout(studentCode, vector, timeoutMs);
      const passed = compareOutput(output, vector.expectedOutput, vector.regexPattern);
      results.push({
        vectorId: vector.id,
        passed,
        output,
        expected: vector.expectedOutput,
        weight: vector.weight,
        executionTimeMs: performance.now() - startTime,
      });
    } catch (err) {
      results.push({
        vectorId: vector.id,
        passed: false,
        output: null,
        error: (err as Error).message,
        expected: vector.expectedOutput,
        weight: vector.weight,
        executionTimeMs: performance.now() - startTime,
      });
    }
  }

  self.postMessage({
    type: 'ASSESSMENT_COMPLETE',
    payload: { results, totalTimeMs: performance.now() - startTime },
  });
}
```

#### 3. Score Attestation

```typescript
interface ScoreAttestation {
  assessmentId: string;
  studentId: string;
  score: number;
  maxScore: number;
  timestamp: number;
  hash: string;
  previousAttestationHash: string | null;
}

async function createAttestation(
  assessment: AssessmentResult,
  studentId: string
): Promise<ScoreAttestation> {
  const attestation: ScoreAttestation = {
    assessmentId: assessment.templateId,
    studentId,
    score: assessment.totalScore,
    maxScore: assessment.maxPossibleScore,
    timestamp: Date.now(),
    hash: '',
    previousAttestationHash: assessment.previousHash ?? null,
  };

  const hashInput = JSON.stringify({
    ...attestation,
    hash: undefined,
  });
  attestation.hash = await sha256(hashInput);
  return attestation;
}
```

---

## Stellar Wave #1085: Soft-Delete & Point-in-Time Restoration

### Prisma Extension

```typescript
import { Prisma } from '@prisma/client';

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      async delete({ args, query }) {
        return query({
          data: { deletedAt: new Date() },
          where: args.where,
        });
      },
      async deleteMany({ args, query }) {
        return query({
          data: { deletedAt: new Date() },
          where: args.where,
        });
      },
      async findFirst({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findMany({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findUnique({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async count({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
    },
  },
});
```

### Snapshot Archiving

```typescript
interface SnapshotRecord {
  id: string;
  entityType: 'course' | 'module' | 'task';
  entityId: string;
  stateTree: Record<string, unknown>;
  version: number;
  createdAt: Date;
  expiresAt: Date;
}

async function createSnapshot(
  entityType: string,
  entityId: string,
  currentData: Record<string, unknown>
): Promise<SnapshotRecord> {
  const latestSnapshot = await prisma.snapshot.findFirst({
    where: { entityType, entityId },
    orderBy: { version: 'desc' },
  });

  const newVersion = (latestSnapshot?.version ?? 0) + 1;
  const retentionDays = 90;

  return prisma.snapshot.create({
    data: {
      entityType,
      entityId,
      stateTree: currentData,
      version: newVersion,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + retentionDays * 86400000),
    },
  });
}

async function restoreFromSnapshot(
  snapshotId: string
): Promise<{ entityType: string; entityId: string; data: Record<string, unknown> }> {
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);
  if (new Date() > snapshot.expiresAt) {
    throw new Error(`Snapshot ${snapshotId} has expired`);
  }

  await createSnapshot(snapshot.entityType, snapshot.entityId, snapshot.stateTree);
  return {
    entityType: snapshot.entityType,
    entityId: snapshot.entityId,
    data: snapshot.stateTree as Record<string, unknown>,
  };
}
```

---

## Stellar Wave #1084: Cryptographic Tamper-Evident Audit Trail

### Merkle Chain Implementation

```typescript
interface AuditRecord {
  id: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousHash: string;
  contentHash: string;
  chainHash: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

async function createAuditRecord(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string,
  previousHash: string,
  metadata: Record<string, unknown>
): Promise<AuditRecord> {
  const content = JSON.stringify({
    adminId, action, entityType, entityId,
    metadata, timestamp: Date.now(),
  });

  const contentHash = await sha256(content);
  const chainHash = await sha256(previousHash + contentHash);

  return {
    id: crypto.randomUUID(),
    adminId,
    action,
    entityType,
    entityId,
    previousHash,
    contentHash,
    chainHash,
    timestamp: Date.now(),
    metadata,
  };
}

async function verifyAuditChain(
  records: AuditRecord[]
): Promise<{ valid: boolean; brokenAt: string | null }> {
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const expectedChain = await sha256(record.previousHash + record.contentHash);

    if (record.chainHash !== expectedChain) {
      return { valid: false, brokenAt: record.id };
    }

    if (i > 0 && record.previousHash !== records[i - 1].chainHash) {
      return { valid: false, brokenAt: record.id };
    }
  }

  return { valid: true, brokenAt: null };
}
```

---

## Stellar Wave #1083: Student Retention & Module Completion Analytics

### Analytics Engine

```typescript
interface StudentCohort {
  id: string;
  name: string;
  startDate: Date;
  studentCount: number;
  completionRate: number;
  averageTimeToComplete: number;
  dropOffPoints: DropOffPoint[];
}

interface DropOffPoint {
  moduleId: string;
  moduleName: string;
  studentsRemaining: number;
  studentsStarted: number;
  dropOffPercent: number;
  averageTimeSpentMs: number;
}

interface CompletionMetrics {
  totalStudents: number;
  completedStudents: number;
  inProgressStudents: number;
  droppedOutStudents: number;
  averageCompletionTimeMs: number;
  medianCompletionTimeMs: number;
  p90CompletionTimeMs: number;
}

async function calculateRetentionMetrics(
  courseId: string,
  startDate: Date,
  endDate: Date
): Promise<CompletionMetrics> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      courseId,
      enrolledAt: { gte: startDate, lte: endDate },
    },
    include: { progress: true },
  });

  const completed = enrollments.filter(e => e.status === 'COMPLETED');
  const inProgress = enrollments.filter(e => e.status === 'IN_PROGRESS');
  const droppedOut = enrollments.filter(e => e.status === 'DROPPED');

  const completionTimes = completed
    .map(e => e.completedAt!.getTime() - e.enrolledAt.getTime())
    .sort((a, b) => a - b);

  return {
    totalStudents: enrollments.length,
    completedStudents: completed.length,
    inProgressStudents: inProgress.length,
    droppedOutStudents: droppedOut.length,
    averageCompletionTimeMs: average(completionTimes),
    medianCompletionTimeMs: percentile(completionTimes, 50),
    p90CompletionTimeMs: percentile(completionTimes, 90),
  };
}

async function identifyDropOffPoints(
  courseId: string
): Promise<DropOffPoint[]> {
  const modules = await prisma.module.findMany({
    where: { courseId },
    orderBy: { order: 'asc' },
    include: { lessons: true },
  });

  const dropOffs: DropOffPoint[] = [];
  let previousRemaining = 0;

  for (const mod of modules) {
    const started = await prisma.progress.count({
      where: { moduleId: mod.id, startedAt: { not: null } },
    });
    const completed = await prisma.progress.count({
      where: { moduleId: mod.id, completedAt: { not: null } },
    });

    const studentsRemaining = started;
    const dropOffPercent = previousRemaining > 0
      ? ((previousRemaining - studentsRemaining) / previousRemaining) * 100
      : 0;

    dropOffs.push({
      moduleId: mod.id,
      moduleName: mod.name,
      studentsRemaining,
      studentsStarted: started,
      dropOffPercent,
      averageTimeSpentMs: 0,
    });

    previousRemaining = studentsRemaining;
  }

  return dropOffs;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function exportAnalyticsReport(
  courseId: string,
  format: 'csv' | 'json'
): Promise<string> {
  const metrics = await calculateRetentionMetrics(courseId, new Date(0), new Date());
  const dropOffs = await identifyDropOffPoints(courseId);

  if (format === 'json') {
    return JSON.stringify({ metrics, dropOffs }, null, 2);
  }

  const rows = [
    'Module,Students Started,Students Remaining,Drop Off %',
    ...dropOffs.map(d =>
      `${d.moduleName},${d.studentsStarted},${d.studentsRemaining},${d.dropOffPercent.toFixed(1)}%`
    ),
  ];
  return rows.join('\n');
}
```

### Database Schema Additions

```sql
-- Soft-delete support
ALTER TABLE courses ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE modules ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP NULL;

-- Snapshot archiving
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  state_tree JSONB NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_snapshots_entity (entity_type, entity_id, version DESC)
);

-- Audit trail (append-only)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  previous_hash VARCHAR(64) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  chain_hash VARCHAR(64) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_chain ON audit_log (chain_hash);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_admin ON audit_log (admin_id, created_at DESC);

-- Retention analytics
CREATE TABLE student_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID NOT NULL,
  module_id UUID NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  time_spent_ms BIGINT DEFAULT 0,
  completion_status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  INDEX idx_analytics_student (student_id, course_id),
  INDEX idx_analytics_course (course_id, module_id)
);
```
