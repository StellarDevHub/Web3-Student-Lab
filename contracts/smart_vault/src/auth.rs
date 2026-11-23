use crate::{EscrowConfig, EscrowRole, Position, VaultError};
use soroban_sdk::{contracttype, panic_with_error, symbol_short, Address, Env};

const ESCROW_RECOVERY_DELAY_SECONDS: u64 = 7 * 24 * 60 * 60;

#[contracttype]
#[derive(Clone)]
enum EscrowKey {
    Config,
    Balance,
    PendingRecovery,
}

#[contracttype]
#[derive(Clone)]
struct PendingRecovery {
    role: EscrowRole,
    replacement: Address,
    execute_after: u64,
}

pub(crate) fn initialize(env: &Env, student: Address, mentor: Address, sponsor: Address) {
    if env.storage().instance().has(&EscrowKey::Config) {
        panic_with_error!(env, VaultError::EscrowAlreadyInitialized);
    }
    if student == mentor || student == sponsor || mentor == sponsor {
        panic_with_error!(env, VaultError::InvalidEscrowSigners);
    }

    student.require_auth();
    mentor.require_auth();
    sponsor.require_auth();

    env.storage().instance().set(
        &EscrowKey::Config,
        &EscrowConfig {
            student,
            mentor,
            sponsor,
        },
    );
    env.storage().instance().set(&EscrowKey::Balance, &0i128);
}

pub(crate) fn fund(env: &Env, funder: &Address, shares: i128) {
    let _ = config(env);
    funder.require_auth();
    if shares <= 0 {
        panic_with_error!(env, VaultError::ZeroAmount);
    }

    let mut position: Position = env.storage().persistent().get(funder).unwrap_or(Position {
        shares: 0,
        last_harvest: 0,
    });
    if position.shares < shares {
        panic_with_error!(env, VaultError::InsufficientShares);
    }
    position.shares = position
        .shares
        .checked_sub(shares)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::Underflow));
    env.storage().persistent().set(funder, &position);

    let balance: i128 = env
        .storage()
        .instance()
        .get(&EscrowKey::Balance)
        .unwrap_or(0);
    let new_balance = balance
        .checked_add(shares)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::Overflow));
    env.storage()
        .instance()
        .set(&EscrowKey::Balance, &new_balance);
    env.events().publish(
        (symbol_short!("escrow"), symbol_short!("fund")),
        (funder, shares),
    );
}

pub(crate) fn release(
    env: &Env,
    student: &Address,
    mentor: &Address,
    sponsor: &Address,
    recipient: &Address,
    shares: i128,
) {
    let participants = config(env);
    if *student != participants.student
        || *mentor != participants.mentor
        || *sponsor != participants.sponsor
    {
        panic_with_error!(env, VaultError::InvalidEscrowSigners);
    }

    student.require_auth();
    mentor.require_auth();
    sponsor.require_auth();
    if shares <= 0 {
        panic_with_error!(env, VaultError::ZeroAmount);
    }

    let balance: i128 = env
        .storage()
        .instance()
        .get(&EscrowKey::Balance)
        .unwrap_or(0);
    if balance < shares {
        panic_with_error!(env, VaultError::InsufficientEscrowBalance);
    }

    let mut position: Position = env
        .storage()
        .persistent()
        .get(recipient)
        .unwrap_or(Position {
            shares: 0,
            last_harvest: 0,
        });
    position.shares = position
        .shares
        .checked_add(shares)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::Overflow));
    env.storage().persistent().set(recipient, &position);
    env.storage()
        .instance()
        .set(&EscrowKey::Balance, &(balance - shares));
    env.events().publish(
        (symbol_short!("escrow"), symbol_short!("release")),
        (recipient, shares),
    );
}

pub(crate) fn balance(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&EscrowKey::Balance)
        .unwrap_or(0)
}

pub(crate) fn config(env: &Env) -> EscrowConfig {
    env.storage()
        .instance()
        .get(&EscrowKey::Config)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::EscrowNotInitialized))
}

pub(crate) fn propose_recovery(env: &Env, role: EscrowRole, replacement: Address) {
    let mut participants = config(env);
    if env.storage().instance().has(&EscrowKey::PendingRecovery) {
        panic_with_error!(env, VaultError::RecoveryPending);
    }

    match role {
        EscrowRole::Student => {
            participants.mentor.require_auth();
            participants.sponsor.require_auth();
        }
        EscrowRole::Mentor => {
            participants.student.require_auth();
            participants.sponsor.require_auth();
        }
        EscrowRole::Sponsor => {
            participants.student.require_auth();
            participants.mentor.require_auth();
        }
    }

    if replacement == participants.student
        || replacement == participants.mentor
        || replacement == participants.sponsor
    {
        panic_with_error!(env, VaultError::InvalidRecoveryTarget);
    }
    replacement.require_auth();

    let execute_after = env
        .ledger()
        .timestamp()
        .checked_add(ESCROW_RECOVERY_DELAY_SECONDS)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::Overflow));
    env.storage().instance().set(
        &EscrowKey::PendingRecovery,
        &PendingRecovery {
            role,
            replacement: replacement.clone(),
            execute_after,
        },
    );
    env.events().publish(
        (symbol_short!("escrow"), symbol_short!("recover")),
        (role, replacement, execute_after),
    );
}

pub(crate) fn execute_recovery(env: &Env) {
    let mut participants = config(env);
    let pending: PendingRecovery = env
        .storage()
        .instance()
        .get(&EscrowKey::PendingRecovery)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NoRecoveryPending));
    if env.ledger().timestamp() < pending.execute_after {
        panic_with_error!(env, VaultError::RecoveryTimelockActive);
    }

    match pending.role {
        EscrowRole::Student => participants.student = pending.replacement.clone(),
        EscrowRole::Mentor => participants.mentor = pending.replacement.clone(),
        EscrowRole::Sponsor => participants.sponsor = pending.replacement.clone(),
    }
    env.storage()
        .instance()
        .set(&EscrowKey::Config, &participants);
    env.storage().instance().remove(&EscrowKey::PendingRecovery);
    env.events().publish(
        (symbol_short!("escrow"), symbol_short!("recovered")),
        (pending.role, pending.replacement),
    );
}
