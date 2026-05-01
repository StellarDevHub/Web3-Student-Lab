#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec, Map};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub description: Symbol,
    pub amount: i128,
    pub is_completed: bool,
    pub is_approved: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Job {
    pub client: Address,
    pub freelancer: Address,
    pub budget: i128,
    pub milestones: Vec<Milestone>,
    pub status: Symbol,
}

#[contract]
pub struct FreelancePlatform;

#[contractimpl]
impl FreelancePlatform {
    pub fn create_job(env: Env, client: Address, freelancer: Address, budget: i128, descriptions: Vec<Symbol>, amounts: Vec<i128>) {
        client.require_auth();
        let mut milestones = Vec::new(&env);
        for i in 0..descriptions.len() {
            milestones.push_back(Milestone {
                description: descriptions.get(i).unwrap(),
                amount: amounts.get(i).unwrap(),
                is_completed: false,
                is_approved: false,
            });
        }
        let job = Job { client, freelancer, budget, milestones, status: symbol_short!("active") };
        env.storage().instance().set(&symbol_short!("job"), &job);
    }

    pub fn approve_milestone(env: Env, milestone_index: u32) {
        let mut job: Job = env.storage().instance().get(&symbol_short!("job")).unwrap();
        job.client.require_auth();
        let mut milestones = job.milestones;
        let mut m = milestones.get(milestone_index).unwrap();
        m.is_approved = true;
        milestones.set(milestone_index, m);
        job.milestones = milestones;
        env.storage().instance().set(&symbol_short!("job"), &job);
        env.events().publish((symbol_short!("payout"), job.freelancer), milestone_index);
    }
}

pub mod reputation_system;
