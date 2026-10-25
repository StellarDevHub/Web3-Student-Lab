//! # Sybil Penalty Slasher & Bounty Distribution — SC-037
//!
//! Handles stake confiscation, donation disqualification from quadratic calculations,
//! and 50% bounty distribution to reporting investigators.

use crate::collusion_detection::{verify_collusion_proof, CollusionProof};
use crate::{bump_instance, Project, POOL_KEY, PROJECTS_KEY, SCALE, WHITELIST_KEY};
use soroban_sdk::{contracterror, contracttype, symbol_short, Address, Env, Map, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SlasherError {
    InvalidProof = 1,
    InsufficientColluders = 2,
    DonorNotGuilty = 3,
    NoStakeToSlash = 4,
    ProjectNotFound = 5,
    SelfAccusation = 6,
    RoundNotOpen = 7,
    AlreadySlashed = 8,
}

#[contracttype]
#[derive(Clone)]
pub enum SlasherDataKey {
    DonorStake(Address),
    SlashedDonor(Address),
    DisqualifiedDonations(Address),
}

/// Deposit stake or security bond for a donor.
pub fn deposit_stake(env: &Env, donor: &Address, amount: i128) {
    donor.require_auth();
    assert!(amount > 0, "stake amount must be positive");

    let key = SlasherDataKey::DonorStake(donor.clone());
    let current_stake: i128 = env.storage().instance().get(&key).unwrap_or(0);
    let new_stake = current_stake.checked_add(amount).expect("overflow");
    env.storage().instance().set(&key, &new_stake);
    bump_instance(env);
}

/// Query current deposited security stake for a donor.
pub fn get_stake(env: &Env, donor: &Address) -> i128 {
    let key = SlasherDataKey::DonorStake(donor.clone());
    env.storage().instance().get(&key).unwrap_or(0)
}

/// Check if a donor address has been slashed for collusion.
pub fn is_slashed(env: &Env, donor: &Address) -> bool {
    let key = SlasherDataKey::SlashedDonor(donor.clone());
    env.storage().instance().get(&key).unwrap_or(false)
}

/// Slash colluding cluster accounts based on verified cryptographic proof.
///
/// 1. Verifies cryptographic collusion proof.
/// 2. Disqualifies collusive donations from matching calculations.
/// 3. Confiscates stake of guilty parties.
/// 4. Awards 50% bounty to the reporting investigator.
pub fn slash_collusion(
    env: &Env,
    investigator: &Address,
    project_id: u32,
    colluders: &Vec<Address>,
    proof: &CollusionProof,
) -> Result<i128, SlasherError> {
    investigator.require_auth();

    // Enforce cryptographic proof validation
    verify_collusion_proof(env, proof, colluders)?;

    // Investigator cannot be among the accused colluders
    for colluder in colluders.iter() {
        if *investigator == colluder {
            return Err(SlasherError::SelfAccusation);
        }
    }

    let mut projects: Map<u32, Project> = env
        .storage()
        .instance()
        .get(&PROJECTS_KEY)
        .ok_or(SlasherError::ProjectNotFound)?;
    let mut project = projects
        .get(project_id)
        .ok_or(SlasherError::ProjectNotFound)?;

    let mut wl: Map<Address, bool> = env
        .storage()
        .instance()
        .get(&WHITELIST_KEY)
        .unwrap_or_else(|| Map::new(env));

    let mut total_confiscated_stake: i128 = 0;

    for colluder in colluders.iter() {
        if is_slashed(env, &colluder) {
            return Err(SlasherError::AlreadySlashed);
        }

        // Each accused colluder must have donated to the targeted project
        let donated_amount = project
            .donors
            .get(colluder.clone())
            .ok_or(SlasherError::DonorNotGuilty)?;

        // Disqualify donation from matching calculations
        project.total_donations = project
            .total_donations
            .checked_sub(donated_amount)
            .unwrap_or(0);

        let sqrt_contribution = crate::QuadraticFunding::isqrt(
            donated_amount.checked_mul(SCALE * SCALE).expect("overflow"),
        );
        project.sqrt_sum = project.sqrt_sum.checked_sub(sqrt_contribution).unwrap_or(0);

        project.donors.remove(colluder.clone());

        // Confiscate deposited stake
        let stake_key = SlasherDataKey::DonorStake(colluder.clone());
        let stake: i128 = env.storage().instance().get(&stake_key).unwrap_or(0);
        total_confiscated_stake = total_confiscated_stake
            .checked_add(stake)
            .expect("overflow");
        env.storage().instance().set(&stake_key, &0i128);

        // Mark colluder as slashed and revoke whitelist
        let slashed_key = SlasherDataKey::SlashedDonor(colluder.clone());
        env.storage().instance().set(&slashed_key, &true);
        wl.set(colluder.clone(), false);
    }

    // Persist updated project state and whitelist
    projects.set(project_id, project);
    env.storage().instance().set(&PROJECTS_KEY, &projects);
    env.storage().instance().set(&WHITELIST_KEY, &wl);

    // Calculate 50% bounty for the reporting investigator
    let bounty = total_confiscated_stake / 2;
    let pool_contribution = total_confiscated_stake.checked_sub(bounty).unwrap_or(0);

    // Add remaining confiscated stake to matching pool
    if pool_contribution > 0 {
        let current_pool: i128 = env.storage().instance().get(&POOL_KEY).unwrap_or(0);
        env.storage()
            .instance()
            .set(&POOL_KEY, &(current_pool + pool_contribution));
    }

    env.events().publish(
        (symbol_short!("slashed"), investigator.clone()),
        (project_id, total_confiscated_stake, bounty),
    );
    bump_instance(env);

    Ok(bounty)
}
