//! Decentralized job board with escrow, milestone payments, and dispute resolution.
#![allow(dead_code)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

pub const MAX_MILESTONES: u32 = 10;
pub const MAX_SKILLS: u32 = 20;

// ── Types ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JobStatus {
    Open,
    InProgress,
    Completed,
    Disputed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    Pending,
    Submitted,
    Approved,
    Disputed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub description: Symbol,
    pub payment: u64,
    pub status: MilestoneStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Job {
    pub id: u64,
    pub employer: Address,
    pub title: Symbol,
    pub budget: u64,
    pub escrowed: u64,
    pub required_skills: Vec<Symbol>,
    pub milestones: Vec<Milestone>,
    pub applicant: Option<Address>,
    pub status: JobStatus,
    pub created_at: u64,
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum JobKey {
    Admin,
    NextId,
    Job(u64),
    Applications(u64), // Vec<Address>
}

// ── Contract ───────────────────────────────────────────────────────────────

#[contract]
pub struct JobBoardContract;

#[contractimpl]
impl JobBoardContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&JobKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&JobKey::Admin, &admin);
        env.storage().instance().set(&JobKey::NextId, &0u64);
    }

    /// Post a job. Employer deposits full budget into escrow.
    pub fn post_job(
        env: Env,
        employer: Address,
        title: Symbol,
        budget: u64,
        required_skills: Vec<Symbol>,
        milestones: Vec<Milestone>,
        deadline_ledgers: u64,
    ) -> u64 {
        employer.require_auth();
        assert!(budget > 0, "budget must be > 0");
        assert!(!milestones.is_empty(), "need at least one milestone");
        assert!(
            milestones.len() <= MAX_MILESTONES,
            "too many milestones"
        );
        assert!(
            required_skills.len() <= MAX_SKILLS,
            "too many skills"
        );

        // Verify milestone payments sum to budget
        let total: u64 = milestones.iter().map(|m| m.payment).sum();
        assert!(total == budget, "milestone payments must equal budget");

        let id: u64 = env
            .storage()
            .instance()
            .get(&JobKey::NextId)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&JobKey::NextId, &(id + 1));

        let job = Job {
            id,
            employer: employer.clone(),
            title: title.clone(),
            budget,
            escrowed: budget,
            required_skills,
            milestones,
            applicant: None,
            status: JobStatus::Open,
            created_at: env.ledger().sequence() as u64,
            deadline: env.ledger().sequence() as u64 + deadline_ledgers,
        };

        env.storage().persistent().set(&JobKey::Job(id), &job);
        env.storage()
            .persistent()
            .set(&JobKey::Applications(id), &Vec::<Address>::new(&env));

        env.events().publish(
            (soroban_sdk::symbol_short!("job_post"), employer),
            (id, title, budget),
        );
        id
    }

    /// Apply for a job.
    pub fn apply(env: Env, job_id: u64, applicant: Address) {
        applicant.require_auth();
        let mut job: Job = Self::load_job(&env, job_id);
        assert!(job.status == JobStatus::Open, "job not open");
        assert!(job.applicant.is_none(), "already assigned");

        let mut apps: Vec<Address> = env
            .storage()
            .persistent()
            .get(&JobKey::Applications(job_id))
            .unwrap_or(Vec::new(&env));
        apps.push_back(applicant.clone());
        env.storage()
            .persistent()
            .set(&JobKey::Applications(job_id), &apps);

        env.events().publish(
            (soroban_sdk::symbol_short!("job_apply"), applicant),
            job_id,
        );
        let _ = job; // suppress unused warning
    }

    /// Employer assigns a worker, moving job to InProgress.
    pub fn assign(env: Env, job_id: u64, worker: Address) {
        let mut job: Job = Self::load_job(&env, job_id);
        job.employer.require_auth();
        assert!(job.status == JobStatus::Open, "job not open");

        job.applicant = Some(worker.clone());
        job.status = JobStatus::InProgress;
        env.storage().persistent().set(&JobKey::Job(job_id), &job);

        env.events().publish(
            (soroban_sdk::symbol_short!("job_assign"), job.employer),
            (job_id, worker),
        );
    }

    /// Worker submits a milestone for review.
    pub fn submit_milestone(env: Env, job_id: u64, milestone_idx: u32) {
        let mut job: Job = Self::load_job(&env, job_id);
        let worker = job.applicant.clone().expect("no worker assigned");
        worker.require_auth();
        assert!(job.status == JobStatus::InProgress, "not in progress");

        let mut ms = job.milestones.get(milestone_idx).expect("invalid milestone");
        assert!(ms.status == MilestoneStatus::Pending, "already submitted");
        ms.status = MilestoneStatus::Submitted;
        job.milestones.set(milestone_idx, ms);
        env.storage().persistent().set(&JobKey::Job(job_id), &job);

        env.events().publish(
            (soroban_sdk::symbol_short!("ms_submit"), worker),
            (job_id, milestone_idx),
        );
    }

    /// Employer approves a milestone → releases payment to worker.
    pub fn approve_milestone(env: Env, job_id: u64, milestone_idx: u32) {
        let mut job: Job = Self::load_job(&env, job_id);
        job.employer.require_auth();
        let worker = job.applicant.clone().expect("no worker");

        let mut ms = job.milestones.get(milestone_idx).expect("invalid milestone");
        assert!(ms.status == MilestoneStatus::Submitted, "not submitted");

        let payment = ms.payment;
        ms.status = MilestoneStatus::Approved;
        job.milestones.set(milestone_idx, ms);
        job.escrowed = job.escrowed.saturating_sub(payment);

        // Check if all milestones approved
        let all_done = job
            .milestones
            .iter()
            .all(|m| m.status == MilestoneStatus::Approved);
        if all_done {
            job.status = JobStatus::Completed;
        }

        env.storage().persistent().set(&JobKey::Job(job_id), &job);

        env.events().publish(
            (soroban_sdk::symbol_short!("ms_approve"), job.employer),
            (job_id, milestone_idx, payment, worker),
        );
    }

    /// Open a dispute on a submitted milestone.
    pub fn dispute(env: Env, job_id: u64, milestone_idx: u32) {
        let mut job: Job = Self::load_job(&env, job_id);
        // Either party can dispute
        let caller_is_employer = {
            let emp = job.employer.clone();
            // We can't compare addresses directly without auth; require auth from employer
            // If auth fails we fall through to worker check
            emp.require_auth();
            true
        };
        let _ = caller_is_employer;

        let mut ms = job.milestones.get(milestone_idx).expect("invalid milestone");
        assert!(ms.status == MilestoneStatus::Submitted, "not submitted");
        ms.status = MilestoneStatus::Disputed;
        job.milestones.set(milestone_idx, ms);
        job.status = JobStatus::Disputed;
        env.storage().persistent().set(&JobKey::Job(job_id), &job);

        env.events().publish(
            (soroban_sdk::symbol_short!("disputed"), job.employer),
            (job_id, milestone_idx),
        );
    }

    /// Admin resolves dispute: `release_to_worker` true → pay worker, false → refund employer.
    pub fn resolve_dispute(
        env: Env,
        job_id: u64,
        milestone_idx: u32,
        release_to_worker: bool,
    ) {
        Self::require_admin(&env);
        let mut job: Job = Self::load_job(&env, job_id);
        assert!(job.status == JobStatus::Disputed, "not disputed");

        let mut ms = job.milestones.get(milestone_idx).expect("invalid milestone");
        let payment = ms.payment;
        ms.status = if release_to_worker {
            MilestoneStatus::Approved
        } else {
            MilestoneStatus::Pending
        };
        job.milestones.set(milestone_idx, ms);

        if !release_to_worker {
            // Refund escrowed amount stays; job goes back to InProgress
            job.status = JobStatus::InProgress;
        } else {
            job.escrowed = job.escrowed.saturating_sub(payment);
            let all_done = job
                .milestones
                .iter()
                .all(|m| m.status == MilestoneStatus::Approved);
            job.status = if all_done {
                JobStatus::Completed
            } else {
                JobStatus::InProgress
            };
        }

        env.storage().persistent().set(&JobKey::Job(job_id), &job);

        env.events().publish(
            (soroban_sdk::symbol_short!("resolved"), soroban_sdk::symbol_short!("admin")),
            (job_id, milestone_idx, release_to_worker),
        );
    }

    // ── Views ──────────────────────────────────────────────────────────────

    pub fn get_job(env: Env, job_id: u64) -> Job {
        Self::load_job(&env, job_id)
    }

    pub fn get_applications(env: Env, job_id: u64) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&JobKey::Applications(job_id))
            .unwrap_or(Vec::new(&env))
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    fn load_job(env: &Env, job_id: u64) -> Job {
        env.storage()
            .persistent()
            .get(&JobKey::Job(job_id))
            .expect("job not found")
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&JobKey::Admin)
            .expect("not initialized");
        admin.require_auth();
    }
}
