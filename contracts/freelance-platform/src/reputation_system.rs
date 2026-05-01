#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, symbol_short};

#[contract]
pub struct ReputationSystem;

#[contractimpl]
impl ReputationSystem {
    pub fn add_rating(env: Env, user: Address, rating: u32) {
        if rating > 5 { panic!("Rating must be 1-5"); }
        
        let key = (symbol_short!("rep"), user.clone());
        let current_score: u32 = env.storage().instance().get(&key).unwrap_or(0);
        
        // Simple additive reputation for now
        let new_score = current_score + rating;
        env.storage().instance().set(&key, &new_score);
        
        env.events().publish((symbol_short!("score_up"), user), new_score);
    }

    pub fn get_score(env: Env, user: Address) -> u32 {
        let key = (symbol_short!("rep"), user);
        env.storage().instance().get(&key).unwrap_or(0)
    }
}
