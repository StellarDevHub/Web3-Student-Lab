use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, symbol_short, Address, Env,
};

// ── Errors (SC-HARD-20: range 400+) ──────────────────────────────────────────

/// Typed contract errors for the freelance reputation system.
///
/// Discriminants are in the `400+` range.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FreelanceRepError {
    /// `520` — Rating value is out of the 1–5 range.
    InvalidRating = 520,
}

#[contract]
pub struct ReputationSystem;

#[contractimpl]
impl ReputationSystem {
    pub fn add_rating(env: Env, user: Address, rating: u32) {
        if rating < 1 || rating > 5 {
            panic_with_error!(&env, FreelanceRepError::InvalidRating);
        }

        let key = (symbol_short!("rep"), user.clone());
        let current_score: u32 = env.storage().instance().get(&key).unwrap_or(0);

        // Simple additive reputation for now
        let new_score = current_score + rating;
        env.storage().instance().set(&key, &new_score);

        env.events()
            .publish((symbol_short!("score_up"), user), new_score);
    }

    pub fn get_score(env: Env, user: Address) -> u32 {
        let key = (symbol_short!("rep"), user);
        env.storage().instance().get(&key).unwrap_or(0)
    }
}
