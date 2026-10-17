use crate::{roles, AcError};
use soroban_sdk::{contracttype, symbol_short, Address, Env};

/// Required delay between proposing and claiming admin ownership: 48 hours.
pub const ADMIN_HANDOVER_DELAY: u64 = 48 * 60 * 60;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminProposal {
    pub candidate: Address,
    pub proposed_at: u64,
    pub unlock_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum TimelockKey {
    PendingAdmin,
}

/// Current admin proposes a candidate. Replacing a proposal restarts the full
/// delay and is visible as a new event.
pub fn propose_admin(env: &Env, caller: &Address, candidate: &Address) -> u64 {
    caller.require_auth();
    crate::require_admin!(env, caller);
    if candidate == caller {
        soroban_sdk::panic_with_error!(env, AcError::InvalidAdminProposal);
    }
    let proposed_at = env.ledger().timestamp();
    let unlock_at = proposed_at
        .checked_add(ADMIN_HANDOVER_DELAY)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AcError::Overflow));
    let proposal = AdminProposal {
        candidate: candidate.clone(),
        proposed_at,
        unlock_at,
    };
    env.storage()
        .instance()
        .set(&TimelockKey::PendingAdmin, &proposal);
    env.events().publish(
        (symbol_short!("AC_ADMIN"), symbol_short!("proposed")),
        (caller.clone(), candidate.clone(), unlock_at),
    );
    unlock_at
}

/// Candidate accepts the admin role after the timelock and must authorize
/// the claim themselves.
pub fn claim_admin(env: &Env, candidate: &Address) {
    candidate.require_auth();
    let proposal = pending_admin(env)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AcError::NoPendingTransfer));
    if proposal.candidate != *candidate {
        soroban_sdk::panic_with_error!(env, AcError::Unauthorized);
    }
    if env.ledger().timestamp() < proposal.unlock_at {
        soroban_sdk::panic_with_error!(env, AcError::TimelockNotExpired);
    }

    let previous_admin =
        admin(env).unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AcError::Unauthorized));
    roles::set_admin(env, candidate);
    env.storage().instance().remove(&TimelockKey::PendingAdmin);
    env.events().publish(
        (symbol_short!("AC_ADMIN"), symbol_short!("transfer")),
        (previous_admin, candidate.clone()),
    );
}

/// Cancel a pending transfer. Only the current admin can cancel.
pub fn cancel_admin_proposal(env: &Env, caller: &Address) {
    caller.require_auth();
    crate::require_admin!(env, caller);
    let proposal = pending_admin(env)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AcError::NoPendingTransfer));
    env.storage().instance().remove(&TimelockKey::PendingAdmin);
    env.events().publish(
        (symbol_short!("AC_ADMIN"), symbol_short!("cancel")),
        (caller.clone(), proposal.candidate),
    );
}

/// Returns the current admin if initialized.
pub fn admin(env: &Env) -> Option<Address> {
    roles::admin(env)
}

/// Returns the pending handover, if any.
pub fn pending_admin(env: &Env) -> Option<AdminProposal> {
    env.storage().instance().get(&TimelockKey::PendingAdmin)
}
