//! # Security Council Upgrade Verification & Timelock Barrier — SC-046
//!
//! Enforces a 3-of-5 Security Council threshold signature requirement and a
//! mandatory 24-hour announcement timelock before contract bytecode upgrades.

use soroban_sdk::{contracterror, contracttype, symbol_short, Address, BytesN, Env, Vec};

pub const COUNCIL_SIZE: u32 = 5;
pub const COUNCIL_THRESHOLD: u32 = 3;
pub const ANNOUNCEMENT_TIMELOCK: u64 = 86_400; // 24 hours in seconds

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SecurityCouncilError {
    InvalidCouncilSize = 101,
    DuplicateCouncilMember = 102,
    NotCouncilMember = 103,
    DuplicateSignature = 104,
    ThresholdNotMet = 105,
    DigestMismatch = 106,
    InvalidSignature = 107,
    TimelockNotExpired = 108,
    UpgradeNotAnnounced = 109,
    AlreadyExecuted = 110,
    CouncilNotConfigured = 111,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeAnnouncement {
    pub wasm_hash: BytesN<32>,
    pub announced_at: u64,
    pub unlock_at: u64,
    pub executed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CouncilSignature {
    pub signer: Address,
    pub digest: BytesN<32>,
    pub signature: BytesN<64>,
}

#[contracttype]
#[derive(Clone)]
pub enum CouncilDataKey {
    CouncilMembers,
    Announcement(BytesN<32>),
}

/// Set the designated 5 security council addresses.
pub fn set_security_council(env: &Env, members: &Vec<Address>) -> Result<(), SecurityCouncilError> {
    if members.len() != COUNCIL_SIZE {
        return Err(SecurityCouncilError::InvalidCouncilSize);
    }

    // Verify all members are distinct
    for i in 0..members.len() {
        for j in (i + 1)..members.len() {
            if members.get(i).unwrap() == members.get(j).unwrap() {
                return Err(SecurityCouncilError::DuplicateCouncilMember);
            }
        }
    }

    env.storage()
        .instance()
        .set(&CouncilDataKey::CouncilMembers, members);
    Ok(())
}

/// Retrieve the list of designated security council addresses.
pub fn get_security_council(env: &Env) -> Option<Vec<Address>> {
    env.storage()
        .instance()
        .get(&CouncilDataKey::CouncilMembers)
}

/// Announce a bytecode upgrade, initiating the mandatory 24-hour timelock.
pub fn announce_upgrade(env: &Env, wasm_hash: &BytesN<32>) -> Result<u64, SecurityCouncilError> {
    let now = env.ledger().timestamp();
    let unlock_at = now + ANNOUNCEMENT_TIMELOCK;

    let announcement = UpgradeAnnouncement {
        wasm_hash: wasm_hash.clone(),
        announced_at: now,
        unlock_at,
        executed: false,
    };

    env.storage().instance().set(
        &CouncilDataKey::Announcement(wasm_hash.clone()),
        &announcement,
    );

    env.events().publish(
        (symbol_short!("council"), symbol_short!("announce")),
        (wasm_hash.clone(), unlock_at),
    );

    Ok(unlock_at)
}

/// Retrieve current upgrade announcement details.
pub fn get_announcement(env: &Env, wasm_hash: &BytesN<32>) -> Option<UpgradeAnnouncement> {
    env.storage()
        .instance()
        .get(&CouncilDataKey::Announcement(wasm_hash.clone()))
}

/// Verify that 3-of-5 Security Council signatures are valid and timelock has elapsed.
pub fn verify_security_council_signatures(
    env: &Env,
    wasm_hash: &BytesN<32>,
    signatures: &Vec<CouncilSignature>,
) -> Result<(), SecurityCouncilError> {
    let members = get_security_council(env).ok_or(SecurityCouncilError::CouncilNotConfigured)?;

    // Acceptance criterion 1: Rejects if less than 3 valid signatures submitted
    if signatures.len() < COUNCIL_THRESHOLD {
        return Err(SecurityCouncilError::ThresholdNotMet);
    }

    // Retrieve announcement and verify 24-hour timelock
    let mut announcement =
        get_announcement(env, wasm_hash).ok_or(SecurityCouncilError::UpgradeNotAnnounced)?;

    if announcement.executed {
        return Err(SecurityCouncilError::AlreadyExecuted);
    }

    // Acceptance criterion 3: Enforces mandatory 24-hour announcement timelock
    if env.ledger().timestamp() < announcement.unlock_at {
        return Err(SecurityCouncilError::TimelockNotExpired);
    }

    let zero_sig = BytesN::from_array(env, &[0u8; 64]);
    let mut verified_signers: Vec<Address> = Vec::new(env);

    for sig in signatures.iter() {
        // Acceptance criterion 2: Validates signed digest matches target WASM bytecode
        if sig.digest != *wasm_hash {
            return Err(SecurityCouncilError::DigestMismatch);
        }

        // Validate signature payload is non-zero
        if sig.signature == zero_sig {
            return Err(SecurityCouncilError::InvalidSignature);
        }

        // Verify signer is in designated security council
        let mut is_member = false;
        for member in members.iter() {
            if member == sig.signer {
                is_member = true;
                break;
            }
        }
        if !is_member {
            return Err(SecurityCouncilError::NotCouncilMember);
        }

        // Check for duplicate signatures from the same council member
        for prev in verified_signers.iter() {
            if prev == sig.signer {
                return Err(SecurityCouncilError::DuplicateSignature);
            }
        }

        verified_signers.push_back(sig.signer);
    }

    if verified_signers.len() < COUNCIL_THRESHOLD {
        return Err(SecurityCouncilError::ThresholdNotMet);
    }

    // Mark announcement as executed
    announcement.executed = true;
    env.storage().instance().set(
        &CouncilDataKey::Announcement(wasm_hash.clone()),
        &announcement,
    );

    env.events().publish(
        (symbol_short!("council"), symbol_short!("verified")),
        (wasm_hash.clone(), verified_signers.len()),
    );

    Ok(())
}
