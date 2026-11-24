//! # Slashing and Deposit Redistribution
//!
//! Submodule handling deposit accounting, slashing for non-disclosure,
//! and stake redistribution among honest participants.
//!
//! When participants commit, they can optionally (or mandatorily) deposit stake.
//! If a participant fails to reveal before the reveal deadline closes, their deposit
//! is confiscated (slashed). The confiscated funds can then be redistributed equally
//! among honest participants who successfully revealed their commitments.

use soroban_sdk::{token, Address, Env, Map, Vec};

/// Check if a participant has deposited stake.
pub fn get_deposit(_env: &Env, deposits: &Map<Address, i128>, participant: &Address) -> i128 {
    deposits.get(participant.clone()).unwrap_or(0)
}

/// Slashes all participants who committed but failed to reveal.
/// Returns the total confiscated amount from slashed participants.
pub fn slash_unrevealed(
    _env: &Env,
    commits: &Map<Address, soroban_sdk::BytesN<32>>,
    reveals: &Map<Address, bool>,
    slashed: &mut Vec<Address>,
    deposits: &mut Map<Address, i128>,
) -> i128 {
    let mut total_slashed: i128 = 0;

    for (addr, _) in commits.iter() {
        if !reveals.contains_key(addr.clone()) && !slashed.contains(addr.clone()) {
            slashed.push_back(addr.clone());
            if let Some(deposit) = deposits.get(addr.clone()) {
                total_slashed = total_slashed.checked_add(deposit).expect("overflow");
                deposits.set(addr.clone(), 0);
            }
        }
    }

    total_slashed
}

/// Redistributes confiscated stake among honest revealers.
/// Transferees must have revealed. Any indivisible remainder stays in contract or is handled cleanly.
pub fn redistribute_slashed_stake(
    env: &Env,
    token_addr: &Address,
    reveals: &Map<Address, bool>,
    slashed_amount: i128,
) -> i128 {
    if slashed_amount <= 0 || reveals.is_empty() {
        return 0;
    }

    let revealer_count = reveals.keys().len() as i128;
    if revealer_count == 0 {
        return 0;
    }

    let share_per_revealer = slashed_amount / revealer_count;
    if share_per_revealer <= 0 {
        return 0;
    }

    let token_client = token::Client::new(env, token_addr);
    let contract_addr = env.current_contract_address();

    let mut total_distributed: i128 = 0;
    for (revealer, _) in reveals.iter() {
        token_client.transfer(&contract_addr, &revealer, &share_per_revealer);
        total_distributed = total_distributed
            .checked_add(share_per_revealer)
            .expect("overflow");
    }

    total_distributed
}
