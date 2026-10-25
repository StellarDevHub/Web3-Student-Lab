use soroban_sdk::{token, Address, Env};

/// Burn legacy tokens directly from the user's balance using the allowance
/// granted to this migration contract.
pub fn burn_from(env: &Env, legacy_token: &Address, user: &Address, amount: i128) {
    token::Client::new(env, legacy_token).burn_from(&env.current_contract_address(), user, &amount);
}
