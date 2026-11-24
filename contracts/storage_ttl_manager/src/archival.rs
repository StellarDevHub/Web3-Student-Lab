//! # Automated State Archival & Eviction Recovery — SC-038
//!
//! Provides automated state archival detection, rent calculation, and a standardized
//! `restore_state` invocation path for recovering expired/archived ledger entries.

use crate::{PERSISTENT_BUMP_LEDGERS, TTL_THRESHOLD_LEDGERS};
use soroban_sdk::{
    contracterror, contracttype, panic_with_error, symbol_short, Address, Bytes, Env, Symbol,
};

/// Base restoration fee per entry.
pub const BASE_RESTORATION_FEE: i128 = 100;
/// Rent fee per elapsed ledger while archived.
pub const RENT_FEE_PER_LEDGER: i128 = 5;
/// Rent multiplier per byte of stored data.
pub const RENT_FEE_PER_BYTE: i128 = 1;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ArchivalError {
    NotArchived = 1,
    AlreadyArchived = 2,
    InsufficientFee = 3,
    Unauthorized = 4,
    KeyNotFound = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArchivedState {
    pub key: Symbol,
    pub owner: Address,
    pub archived_at_ledger: u32,
    pub entry_size_bytes: u32,
    pub is_archived: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum ArchivalDataKey {
    ArchivedRecord(Symbol),
    ArchivalData(Symbol),
}

/// Calculate the exact restoration rent cost based on elapsed ledgers and entry size.
pub fn calculate_restoration_cost(
    env: &Env,
    archived_at_ledger: u32,
    entry_size_bytes: u32,
) -> i128 {
    let current_ledger = env.ledger().sequence();
    let elapsed = current_ledger.saturating_sub(archived_at_ledger) as i128;

    BASE_RESTORATION_FEE
        .checked_add(elapsed.checked_mul(RENT_FEE_PER_LEDGER).unwrap_or(0))
        .and_then(|val| {
            val.checked_add(
                (entry_size_bytes as i128)
                    .checked_mul(RENT_FEE_PER_BYTE)
                    .unwrap_or(0),
            )
        })
        .unwrap_or(i128::MAX)
}

/// Check if a specific ledger key is currently archived.
pub fn is_archived(env: &Env, key: &Symbol) -> bool {
    if let Some(record) = env
        .storage()
        .persistent()
        .get::<ArchivalDataKey, ArchivedState>(&ArchivalDataKey::ArchivedRecord(key.clone()))
    {
        record.is_archived
    } else {
        false
    }
}

/// Archive an inactive or expired state entry.
pub fn archive_state(env: &Env, owner: &Address, key: &Symbol, entry_data: &Bytes) {
    let current_ledger = env.ledger().sequence();
    let size = entry_data.len();

    let record = ArchivedState {
        key: key.clone(),
        owner: owner.clone(),
        archived_at_ledger: current_ledger,
        entry_size_bytes: size,
        is_archived: true,
    };

    env.storage()
        .persistent()
        .set(&ArchivalDataKey::ArchivedRecord(key.clone()), &record);
    env.storage()
        .persistent()
        .set(&ArchivalDataKey::ArchivalData(key.clone()), entry_data);

    env.events().publish(
        (symbol_short!("archived"), key.clone()),
        (owner.clone(), current_ledger),
    );
}

/// Standardized restore_state invocation path:
/// Validates payment of required renewal rent fees, un-archives the entry,
/// extends its persistent TTL beyond the threshold, and restores full functionality.
pub fn restore_state(env: &Env, payer: &Address, key: &Symbol, fee_payment: i128) -> i128 {
    payer.require_auth();

    let mut record = env
        .storage()
        .persistent()
        .get::<ArchivalDataKey, ArchivedState>(&ArchivalDataKey::ArchivedRecord(key.clone()))
        .unwrap_or_else(|| panic_with_error!(env, ArchivalError::KeyNotFound));

    if !record.is_archived {
        panic_with_error!(env, ArchivalError::NotArchived);
    }

    let required_cost =
        calculate_restoration_cost(env, record.archived_at_ledger, record.entry_size_bytes);

    if fee_payment < required_cost {
        panic_with_error!(env, ArchivalError::InsufficientFee);
    }

    // Mark restored
    record.is_archived = false;
    env.storage()
        .persistent()
        .set(&ArchivalDataKey::ArchivedRecord(key.clone()), &record);

    // Bump persistent TTL beyond 100,000 ledgers to guarantee functionality
    env.storage().persistent().extend_ttl(
        &ArchivalDataKey::ArchivedRecord(key.clone()),
        TTL_THRESHOLD_LEDGERS,
        PERSISTENT_BUMP_LEDGERS,
    );
    env.storage().persistent().extend_ttl(
        &ArchivalDataKey::ArchivalData(key.clone()),
        TTL_THRESHOLD_LEDGERS,
        PERSISTENT_BUMP_LEDGERS,
    );

    env.events().publish(
        (symbol_short!("restored"), key.clone()),
        (payer.clone(), required_cost),
    );

    required_cost
}
