use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, String, Symbol, Vec};

/// Represents a single payment milestone in a freelance job
#[contracttype]
#[derive(Clone, Debug)]
pub struct Milestone {
    pub description: String,
    pub amount: i128,
    pub completed: bool,
    pub approved: bool,
    pub released: bool,
}

/// Represents a freelance job posting
#[contracttype]
#[derive(Clone, Debug)]
pub struct Job {
    pub id: u64,
    pub client: Address,
    pub freelancer: Option<Address>,
    pub title: String,
    pub description: String,
    pub milestones: Vec<Milestone>,
    pub total_budget: i128,
    pub status: JobStatus,
    pub applications: Vec<Address>,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum JobStatus {
    Open,
    InProgress,
    Completed,
    Disputed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct JobPostedEvent {
    pub job_id: u64,
    pub client: Address,
    pub title: String,
    pub budget: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MilestoneFundedEvent {
    pub job_id: u64,
    pub milestone_index: u32,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MilestoneReleasedEvent {
    pub job_id: u64,
    pub milestone_index: u32,
    pub freelancer: Address,
    pub amount: i128,
    pub timestamp: u64,
}

const KEY_JOBS: Symbol = Symbol::new("jobs");
const KEY_NEXT_ID: Symbol = Symbol::new("next_job_id");
const KEY_ESCROW: Symbol = Symbol::new("escrow");

#[contract]
pub struct FreelancePlatform;

#[contractimpl]
impl FreelancePlatform {
    /// Initialize the contract
    pub fn initialize(env: Env) {
        if env.storage().instance().has(&KEY_NEXT_ID) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&KEY_NEXT_ID, &0u64);
        env.storage().instance().set(&KEY_JOBS, &Map::<u64, Job>::new(&env));
        env.storage().instance().set(&KEY_ESCROW, &Map::<u64, i128>::new(&env));
    }

    /// Post a new freelance job with milestones
    pub fn post_job(
        env: Env,
        client: Address,
        title: String,
        description: String,
        milestone_descriptions: Vec<String>,
        milestone_amounts: Vec<i128>,
    ) -> u64 {
        client.require_auth();

        let total_budget: i128 = milestone_amounts.iter().sum();
        let mut milestones = Vec::new(&env);

        for i in 0..milestone_descriptions.len() {
            milestones.push_back(Milestone {
                description: milestone_descriptions.get(i).unwrap(),
                amount: milestone_amounts.get(i).unwrap(),
                completed: false,
                approved: false,
                released: false,
            });
        }

        let mut next_id: u64 = env.storage().instance().get(&KEY_NEXT_ID).unwrap_or(0);
        let job_id = next_id;
        next_id += 1;
        env.storage().instance().set(&KEY_NEXT_ID, &next_id);

        let job = Job {
            id: job_id,
            client: client.clone(),
            freelancer: None,
            title: title.clone(),
            description,
            milestones,
            total_budget,
            status: JobStatus::Open,
            applications: Vec::new(&env),
            created_at: env.ledger().timestamp(),
        };

        let mut jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        jobs.set(job_id, job);
        env.storage().instance().set(&KEY_JOBS, &jobs);

        env.events().publish(
            (Symbol::new(&env, "job_posted"),),
            JobPostedEvent {
                job_id,
                client,
                title,
                budget: total_budget,
                timestamp: env.ledger().timestamp(),
            },
        );

        job_id
    }

    /// Apply for a job as a freelancer
    pub fn apply_for_job(env: Env, job_id: u64, freelancer: Address) {
        freelancer.require_auth();

        let mut jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        let mut job = jobs.get(job_id).expect("Job not found");

        if job.status != JobStatus::Open {
            panic!("Job is not open for applications");
        }

        let mut apps = job.applications;
        apps.push_back(freelancer);
        job.applications = apps;
        jobs.set(job_id, job);
        env.storage().instance().set(&KEY_JOBS, &jobs);
    }

    /// Client selects a freelancer and funds the first milestone
    pub fn hire_freelancer(env: Env, job_id: u64, client: Address, freelancer: Address, token: Address) {
        client.require_auth();

        let mut jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        let mut job = jobs.get(job_id).expect("Job not found");

        if job.client != client {
            panic!("Only the client can hire");
        }

        let first_amount = job.milestones.get(0).unwrap().amount;

        // Transfer tokens from client to contract escrow
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&client, &env.current_contract_address(), &first_amount);

        let mut escrow: Map<u64, i128> = env.storage().instance().get(&KEY_ESCROW).unwrap();
        escrow.set(job_id, first_amount);
        env.storage().instance().set(&KEY_ESCROW, &escrow);

        job.freelancer = Some(freelancer.clone());
        job.status = JobStatus::InProgress;
        jobs.set(job_id, job);
        env.storage().instance().set(&KEY_JOBS, &jobs);

        env.events().publish(
            (Symbol::new(&env, "milestone_funded"),),
            MilestoneFundedEvent {
                job_id,
                milestone_index: 0,
                amount: first_amount,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Freelancer marks a milestone as complete
    pub fn complete_milestone(env: Env, job_id: u64, milestone_index: u32, freelancer: Address) {
        freelancer.require_auth();

        let mut jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        let mut job = jobs.get(job_id).expect("Job not found");

        if job.freelancer.as_ref() != Some(&freelancer) {
            panic!("Only assigned freelancer can mark complete");
        }

        let mut milestones = job.milestones;
        let mut milestone = milestones.get(milestone_index).expect("Milestone not found");
        milestone.completed = true;
        milestones.set(milestone_index, milestone);
        job.milestones = milestones;
        jobs.set(job_id, job);
        env.storage().instance().set(&KEY_JOBS, &jobs);
    }

    /// Client approves a completed milestone and releases payment
    pub fn approve_milestone(env: Env, job_id: u64, milestone_index: u32, client: Address, token: Address) {
        client.require_auth();

        let mut jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        let mut job = jobs.get(job_id).expect("Job not found");

        if job.client != client {
            panic!("Only the client can approve");
        }

        let mut milestones = job.milestones;
        let mut milestone = milestones.get(milestone_index).expect("Milestone not found");

        if !milestone.completed {
            panic!("Milestone not yet completed");
        }

        milestone.approved = true;
        milestone.released = true;
        milestones.set(milestone_index, milestone);
        job.milestones = milestones;

        // If last milestone, complete the job
        if milestone_index as usize == milestones.len() - 1 {
            job.status = JobStatus::Completed;
        }

        jobs.set(job_id, job);
        env.storage().instance().set(&KEY_JOBS, &jobs);

        // Release payment to freelancer
        let freelancer = job.freelancer.clone().expect("No freelancer assigned");
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &freelancer, &milestone.amount);

        let mut escrow: Map<u64, i128> = env.storage().instance().get(&KEY_ESCROW).unwrap();
        let current = escrow.get(job_id).unwrap_or(0);
        escrow.set(job_id, current - milestone.amount);
        env.storage().instance().set(&KEY_ESCROW, &escrow);

        env.events().publish(
            (Symbol::new(&env, "milestone_released"),),
            MilestoneReleasedEvent {
                job_id,
                milestone_index,
                freelancer,
                amount: milestone.amount,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Fund the next milestone after one is completed
    pub fn fund_next_milestone(env: Env, job_id: u64, client: Address, token: Address) {
        client.require_auth();

        let mut jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        let job = jobs.get(job_id).expect("Job not found");

        if job.client != client {
            panic!("Only the client can fund");
        }

        // Find the next unfunded milestone
        let mut next_index: Option<u32> = None;
        for i in 0..job.milestones.len() {
            let m = job.milestones.get(i).unwrap();
            if !m.released && !m.approved {
                next_index = Some(i);
                break;
            }
        }

        if let Some(idx) = next_index {
            let milestone = job.milestones.get(idx).unwrap();
            let token_client = soroban_sdk::token::Client::new(&env, &token);
            token_client.transfer(&client, &env.current_contract_address(), &milestone.amount);

            let mut escrow: Map<u64, i128> = env.storage().instance().get(&KEY_ESCROW).unwrap();
            let current = escrow.get(job_id).unwrap_or(0);
            escrow.set(job_id, current + milestone.amount);
            env.storage().instance().set(&KEY_ESCROW, &escrow);

            env.events().publish(
                (Symbol::new(&env, "milestone_funded"),),
                MilestoneFundedEvent {
                    job_id,
                    milestone_index: idx,
                    amount: milestone.amount,
                    timestamp: env.ledger().timestamp(),
                },
            );
        }
    }

    /// Get a job by ID
    pub fn get_job(env: Env, job_id: u64) -> Job {
        let jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        jobs.get(job_id).expect("Job not found")
    }

    /// List all open jobs
    pub fn list_open_jobs(env: Env) -> Vec<Job> {
        let jobs: Map<u64, Job> = env.storage().instance().get(&KEY_JOBS).unwrap();
        let mut result = Vec::new(&env);
        for (_id, job) in jobs.iter() {
            if job.status == JobStatus::Open {
                result.push_back(job);
            }
        }
        result
    }

    /// Get escrow balance for a job
    pub fn get_escrow_balance(env: Env, job_id: u64) -> i128 {
        let escrow: Map<u64, i128> = env.storage().instance().get(&KEY_ESCROW).unwrap();
        escrow.get(job_id).unwrap_or(0)
    }
}
