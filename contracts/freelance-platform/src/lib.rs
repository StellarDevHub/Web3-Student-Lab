#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FreelanceError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    JobNotFound = 4,
    InvalidMilestone = 5,
    MilestoneAlreadyApproved = 6,
    MilestoneNotCompleted = 7,
    NotWorker = 8,
    NotFreelancer = 9,
    NotDisputed = 10,
    BudgetMismatch = 11,
    AlreadyAssigned = 12,
    NotApplied = 13,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub description: Symbol,
    pub amount: i128,
    pub is_completed: bool,
    pub is_approved: bool,
    pub is_disputed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Job {
    pub id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub budget: i128,
    pub milestones: Vec<Milestone>,
    pub status: Symbol,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    NextJobId,
    Job(u64),
    Worker(Address),
    Applications(u64),
}

#[contract]
pub struct FreelancePlatform;

#[contractimpl]
impl FreelancePlatform {
    /// Initialize the freelance platform with admin and payment token.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, FreelanceError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextJobId, &1u64);
    }

    /// Register a freelancer/worker on the platform.
    pub fn register_worker(env: Env, worker: Address) {
        worker.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Worker(worker.clone()), &true);
        env.events()
            .publish((symbol_short!("worker_r"), worker), ());
    }

    /// Check if a worker is registered.
    pub fn is_worker_registered(env: Env, worker: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Worker(worker))
            .unwrap_or(false)
    }

    /// Create a job post and deposit the milestone budgets into escrow.
    pub fn create_job(
        env: Env,
        client: Address,
        freelancer: Address,
        budget: i128,
        descriptions: Vec<Symbol>,
        amounts: Vec<i128>,
    ) -> u64 {
        client.require_auth();

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::NotInitialized))
            .unwrap();

        if descriptions.len() != amounts.len() || descriptions.is_empty() {
            panic_with_error!(&env, FreelanceError::InvalidMilestone);
        }

        // Verify milestone budgets sum to the job budget
        let mut total: i128 = 0;
        for amt in amounts.iter() {
            total += amt;
        }
        if total != budget {
            panic_with_error!(&env, FreelanceError::BudgetMismatch);
        }

        // Transfer total budget from client into escrow (the contract)
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&client, &env.current_contract_address(), &budget);

        let mut milestones = Vec::new(&env);
        for i in 0..descriptions.len() {
            milestones.push_back(Milestone {
                description: descriptions.get(i).unwrap(),
                amount: amounts.get(i).unwrap(),
                is_completed: false,
                is_approved: false,
                is_disputed: false,
            });
        }

        let job_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextJobId)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&DataKey::NextJobId, &(job_id + 1));

        let job = Job {
            id: job_id,
            client: client.clone(),
            freelancer: freelancer.clone(),
            budget,
            milestones,
            status: symbol_short!("active"),
        };

        env.storage().instance().set(&DataKey::Job(job_id), &job);
        env.storage()
            .instance()
            .set(&DataKey::Applications(job_id), &Vec::<Address>::new(&env));

        env.events()
            .publish((symbol_short!("job_new"), client), (job_id, budget));
        job_id
    }

    /// Apply for an open job.
    pub fn apply_for_job(env: Env, job_id: u64, worker: Address) {
        worker.require_auth();
        if !Self::is_worker_registered(env.clone(), worker.clone()) {
            panic_with_error!(&env, FreelanceError::NotWorker);
        }

        let mut apps: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Applications(job_id))
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::JobNotFound))
            .unwrap();

        apps.push_back(worker.clone());
        env.storage()
            .instance()
            .set(&DataKey::Applications(job_id), &apps);
        env.events()
            .publish((symbol_short!("job_apply"), worker), job_id);
    }

    /// Assign a worker to a job (client only).
    pub fn assign_job(env: Env, job_id: u64, worker: Address) {
        let mut job: Job = env
            .storage()
            .instance()
            .get(&DataKey::Job(job_id))
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::JobNotFound))
            .unwrap();

        job.client.require_auth();

        // Verify worker has applied
        let apps: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Applications(job_id))
            .unwrap_or(Vec::new(&env));

        let mut applied = false;
        for app in apps.iter() {
            if app == worker {
                applied = true;
                break;
            }
        }
        if !applied {
            panic_with_error!(&env, FreelanceError::NotApplied);
        }

        job.freelancer = worker.clone();
        env.storage().instance().set(&DataKey::Job(job_id), &job);
        env.events().publish(
            (Symbol::new(&env, "job_assign"), job.client),
            (job_id, worker),
        );
    }

    /// Worker submits a milestone.
    pub fn submit_milestone(env: Env, job_id: u64, milestone_index: u32) {
        let mut job: Job = env
            .storage()
            .instance()
            .get(&DataKey::Job(job_id))
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::JobNotFound))
            .unwrap();

        job.freelancer.require_auth();

        let mut milestones = job.milestones;
        let mut m = milestones
            .get(milestone_index)
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::InvalidMilestone))
            .unwrap();

        m.is_completed = true;
        milestones.set(milestone_index, m);
        job.milestones = milestones;

        env.storage().instance().set(&DataKey::Job(job_id), &job);
        env.events().publish(
            (symbol_short!("ms_submit"), job.freelancer),
            (job_id, milestone_index),
        );
    }

    /// Client approves a milestone and releases escrowed funds to freelancer.
    pub fn approve_milestone(env: Env, job_id: u64, milestone_index: u32) {
        let mut job: Job = env
            .storage()
            .instance()
            .get(&DataKey::Job(job_id))
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::JobNotFound))
            .unwrap();

        job.client.require_auth();

        let mut milestones = job.milestones;
        let mut m = milestones
            .get(milestone_index)
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::InvalidMilestone))
            .unwrap();

        if m.is_approved {
            panic_with_error!(&env, FreelanceError::MilestoneAlreadyApproved);
        }

        m.is_approved = true;
        m.is_completed = true;
        milestones.set(milestone_index, m.clone());
        job.milestones = milestones;

        // Check if all milestones are approved to complete job
        let mut all_done = true;
        for item in job.milestones.iter() {
            if !item.is_approved {
                all_done = false;
                break;
            }
        }
        if all_done {
            job.status = symbol_short!("complete");
        }

        env.storage().instance().set(&DataKey::Job(job_id), &job);

        // Transfer funds from contract to freelancer
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &job.freelancer, &m.amount);

        env.events().publish(
            (Symbol::new(&env, "ms_approve"), job.client),
            (job_id, milestone_index, m.amount),
        );
    }

    /// File a dispute on a milestone.
    pub fn dispute_milestone(env: Env, job_id: u64, milestone_index: u32, caller: Address) {
        caller.require_auth();

        let mut job: Job = env
            .storage()
            .instance()
            .get(&DataKey::Job(job_id))
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::JobNotFound))
            .unwrap();

        if caller != job.client && caller != job.freelancer {
            panic_with_error!(&env, FreelanceError::Unauthorized);
        }

        let mut milestones = job.milestones;
        let mut m = milestones
            .get(milestone_index)
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::InvalidMilestone))
            .unwrap();

        m.is_disputed = true;
        milestones.set(milestone_index, m);
        job.milestones = milestones;
        job.status = symbol_short!("disputed");

        env.storage().instance().set(&DataKey::Job(job_id), &job);
        env.events().publish(
            (symbol_short!("disputed"), caller),
            (job_id, milestone_index),
        );
    }

    /// Admin resolves a dispute, distributing funds accordingly.
    pub fn resolve_dispute(
        env: Env,
        job_id: u64,
        milestone_index: u32,
        release_to_freelancer: bool,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::NotInitialized))
            .unwrap();

        admin.require_auth();

        let mut job: Job = env
            .storage()
            .instance()
            .get(&DataKey::Job(job_id))
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::JobNotFound))
            .unwrap();

        let mut milestones = job.milestones;
        let mut m = milestones
            .get(milestone_index)
            .ok_or_else(|| panic_with_error!(&env, FreelanceError::InvalidMilestone))
            .unwrap();

        if !m.is_disputed {
            panic_with_error!(&env, FreelanceError::NotDisputed);
        }

        m.is_disputed = false;
        m.is_approved = release_to_freelancer;
        milestones.set(milestone_index, m.clone());
        job.milestones = milestones;
        job.status = symbol_short!("active");

        env.storage().instance().set(&DataKey::Job(job_id), &job);

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = soroban_sdk::token::Client::new(&env, &token);

        let recipient = if release_to_freelancer {
            job.freelancer.clone()
        } else {
            job.client.clone()
        };

        token_client.transfer(&env.current_contract_address(), &recipient, &m.amount);

        env.events().publish(
            (symbol_short!("resolved"), admin),
            (job_id, milestone_index, release_to_freelancer, m.amount),
        );
    }

    /// Retrieve job details.
    pub fn get_job(env: Env, job_id: u64) -> Option<Job> {
        env.storage().instance().get(&DataKey::Job(job_id))
    }
}

pub mod reputation_system;

#[cfg(test)]
mod test;
