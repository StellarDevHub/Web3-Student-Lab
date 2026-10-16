//! Decentralized Bounty Board with milestone claim validation, auto-refund, and collaborative split payouts.

use soroban_sdk::{
    contracttype, panic_with_error, symbol_short, token, Address, BytesN, Env, Symbol, Vec,
};
use crate::{DataKey, FreelanceError};

const BPS_DENOMINATOR: u32 = 10_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BountyStatus {
    Open,
    Claimed,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bounty {
    pub id: u64,
    pub funder: Address,
    pub title: Symbol,
    pub amount: i128,
    pub expiration: u64,
    pub status: BountyStatus,
    pub evidence_hash: Option<BytesN<32>>,
    pub claimants: Vec<Address>,
    pub split_bps: Vec<u32>,
}

/// Creates and funds a new open-source bounty, locking collateral securely in escrow.
pub fn create_bounty(
    env: &Env,
    funder: Address,
    title: Symbol,
    amount: i128,
    expiration: u64,
) -> u64 {
    funder.require_auth();
    if amount <= 0 {
        panic_with_error!(env, FreelanceError::BudgetMismatch);
    }
    if expiration <= env.ledger().timestamp() {
        panic_with_error!(env, FreelanceError::BountyExpired);
    }

    let token_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(env, FreelanceError::NotInitialized));

    let token_client = token::Client::new(env, &token_address);
    let contract_addr = env.current_contract_address();
    token_client.transfer(&funder, &contract_addr, &amount);

    let bounty_id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextBountyId)
        .unwrap_or(1);
    env.storage()
        .instance()
        .set(&DataKey::NextBountyId, &(bounty_id + 1));

    let bounty = Bounty {
        id: bounty_id,
        funder: funder.clone(),
        title,
        amount,
        expiration,
        status: BountyStatus::Open,
        evidence_hash: None,
        claimants: Vec::new(env),
        split_bps: Vec::new(env),
    };

    env.storage().instance().set(&DataKey::Bounty(bounty_id), &bounty);
    env.events().publish((symbol_short!("bounty_c"), funder), (bounty_id, amount));

    bounty_id
}

/// Submits work evidence hash for single contributor claim.
pub fn claim_bounty(
    env: &Env,
    claimant: Address,
    bounty_id: u64,
    evidence_hash: BytesN<32>,
) {
    claimant.require_auth();
    let mut bounty: Bounty = env
        .storage()
        .instance()
        .get(&DataKey::Bounty(bounty_id))
        .unwrap_or_else(|| panic_with_error!(env, FreelanceError::BountyNotFound));

    if bounty.status != BountyStatus::Open {
        panic_with_error!(env, FreelanceError::BountyNotOpen);
    }
    if env.ledger().timestamp() > bounty.expiration {
        panic_with_error!(env, FreelanceError::BountyExpired);
    }

    let mut claimants = Vec::new(env);
    claimants.push_back(claimant.clone());

    let mut split_bps = Vec::new(env);
    split_bps.push_back(BPS_DENOMINATOR);

    bounty.status = BountyStatus::Claimed;
    bounty.evidence_hash = Some(evidence_hash.clone());
    bounty.claimants = claimants;
    bounty.split_bps = split_bps;

    env.storage().instance().set(&DataKey::Bounty(bounty_id), &bounty);
    env.events().publish((symbol_short!("bounty_m"), claimant), bounty_id);
}

/// Submits collaborative work evidence with proportional split basis points.
pub fn claim_bounty_collaborative(
    env: &Env,
    submitter: Address,
    bounty_id: u64,
    claimants: Vec<Address>,
    split_bps: Vec<u32>,
    evidence_hash: BytesN<32>,
) {
    submitter.require_auth();
    let mut bounty: Bounty = env
        .storage()
        .instance()
        .get(&DataKey::Bounty(bounty_id))
        .unwrap_or_else(|| panic_with_error!(env, FreelanceError::BountyNotFound));

    if bounty.status != BountyStatus::Open {
        panic_with_error!(env, FreelanceError::BountyNotOpen);
    }
    if env.ledger().timestamp() > bounty.expiration {
        panic_with_error!(env, FreelanceError::BountyExpired);
    }

    if claimants.is_empty() || claimants.len() != split_bps.len() {
        panic_with_error!(env, FreelanceError::InvalidSplit);
    }

    let mut total_bps: u32 = 0;
    for bps in split_bps.iter() {
        if bps == 0 {
            panic_with_error!(env, FreelanceError::InvalidSplit);
        }
        total_bps = total_bps.checked_add(bps).unwrap();
    }
    if total_bps != BPS_DENOMINATOR {
        panic_with_error!(env, FreelanceError::InvalidSplit);
    }

    bounty.status = BountyStatus::Claimed;
    bounty.evidence_hash = Some(evidence_hash);
    bounty.claimants = claimants;
    bounty.split_bps = split_bps;

    env.storage().instance().set(&DataKey::Bounty(bounty_id), &bounty);
    env.events().publish((symbol_short!("bounty_cl"), submitter), bounty_id);
}

/// Verifies submitted pull request evidence and releases payouts (single or split).
pub fn verify_and_payout(env: &Env, funder: Address, bounty_id: u64) {
    funder.require_auth();
    let mut bounty: Bounty = env
        .storage()
        .instance()
        .get(&DataKey::Bounty(bounty_id))
        .unwrap_or_else(|| panic_with_error!(env, FreelanceError::BountyNotFound));

    if bounty.funder != funder {
        panic_with_error!(env, FreelanceError::Unauthorized);
    }
    if bounty.status != BountyStatus::Claimed {
        panic_with_error!(env, FreelanceError::NoEvidenceSubmitted);
    }

    let token_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(env, FreelanceError::NotInitialized));

    let token_client = token::Client::new(env, &token_address);
    let contract_addr = env.current_contract_address();

    let count = bounty.claimants.len();
    let mut distributed: i128 = 0;

    for i in 0..count {
        let claimant = bounty.claimants.get(i).unwrap();
        let bps = bounty.split_bps.get(i).unwrap();
        let payout = if i == count - 1 {
            bounty.amount - distributed
        } else {
            (bounty.amount * (bps as i128)) / (BPS_DENOMINATOR as i128)
        };
        distributed += payout;
        token_client.transfer(&contract_addr, &claimant, &payout);
    }

    bounty.status = BountyStatus::Completed;
    env.storage().instance().set(&DataKey::Bounty(bounty_id), &bounty);
    env.events().publish((symbol_short!("bounty_p"), funder), bounty_id);
}

/// Allows funder to claim a 100% refund once expiration has elapsed without valid completion.
pub fn claim_refund(env: &Env, funder: Address, bounty_id: u64) {
    funder.require_auth();
    let mut bounty: Bounty = env
        .storage()
        .instance()
        .get(&DataKey::Bounty(bounty_id))
        .unwrap_or_else(|| panic_with_error!(env, FreelanceError::BountyNotFound));

    if bounty.funder != funder {
        panic_with_error!(env, FreelanceError::Unauthorized);
    }
    if bounty.status == BountyStatus::Completed || bounty.status == BountyStatus::Refunded {
        panic_with_error!(env, FreelanceError::BountyAlreadyCompleted);
    }
    if env.ledger().timestamp() <= bounty.expiration {
        panic_with_error!(env, FreelanceError::BountyNotExpired);
    }

    let token_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(env, FreelanceError::NotInitialized));

    let token_client = token::Client::new(env, &token_address);
    let contract_addr = env.current_contract_address();
    token_client.transfer(&contract_addr, &funder, &bounty.amount);

    bounty.status = BountyStatus::Refunded;
    env.storage().instance().set(&DataKey::Bounty(bounty_id), &bounty);
    env.events().publish((symbol_short!("bounty_r"), funder), bounty_id);
}

/// Retrieves bounty details by ID.
pub fn get_bounty(env: &Env, bounty_id: u64) -> Option<Bounty> {
    env.storage().instance().get(&DataKey::Bounty(bounty_id))
}
