#![no_std]

//! # Quadratic Funding & Voting Allocation Engine — SC-HARD-14 / SC-005
//!
//! A Gitcoin-style quadratic funding (QF) mechanism where a central matching
//! pool is distributed to projects proportional to the *square* of the sum of
//! square-roots of individual contributions.
//!
//! ## Formula
//! For project `p` with contributors `{c_1, c_2, …, c_n}` donating amounts
//! `{a_1, a_2, …, a_n}`:
//!
//! ```text
//! match(p) = (Σ sqrt(a_i))²
//! ```
//!
//! The matching pool is then distributed proportionally, with floor rounding
//! and any dust (the rounding remainder) assigned to the project with the
//! largest weight so that payouts always sum to exactly the pool:
//!
//! ```text
//! payout(p) = floor(match(p) / Σ_all_projects match(q) × pool)
//! ```
//!
//! ## Sybil Resistance
//! - Each address may donate to a given project **at most once** per round.
//! - Donors must be on the admin whitelist.
//! - If a sybil-resistance contract is configured via `set_sybil_contract`,
//!   every donor must also pass `is_verified(donor)` on that contract.
//!
//! ## Commit-reveal (anti-frontrunning)
//! 1. Commit phase (default): donors call `commit_donation` with a hash.
//! 2. Admin calls `open_reveal`, closing the commit phase.
//! 3. Reveal phase: donors call `reveal_donation` with the preimage fields.
//!    The commitment is checked and the donation is applied via the same
//!    internal path as `donate`.
//!
//! Commitment preimage (see [`commitment_hash`]):
//! `"QF-COMMIT-V1" || donor_xdr || project_id(u64, BE) || amount(i128, BE) || salt(32 bytes)`
//!
//! ## Security
//! - Integer overflow: all arithmetic uses `checked_*`.
//! - Precision: square-root is computed with integer arithmetic scaled by
//!   `SCALE = 1_000_000` to preserve 6 decimal places of precision.
//! - Errors are reported with panics and clear messages.
//!
//! ## Storage TTL (SC-HARD-16)
//! Every state-mutating call bumps instance TTL beyond 100,000 ledgers to
//! protect against automatic ledger state archival on Stellar Mainnet.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, xdr::ToXdr, Address, Bytes, BytesN, Env,
    IntoVal, Map, Symbol, Vec,
};

// ── TTL constants (SC-HARD-16) ───────────────────────────────────────────────

pub const TTL_THRESHOLD: u32 = 10_000;
pub const INSTANCE_BUMP: u32 = 100_000;

// ── Storage keys ─────────────────────────────────────────────────────────────

const POOL_KEY: Symbol = symbol_short!("POOL");
const PROJECTS_KEY: Symbol = symbol_short!("PROJECTS");
const WHITELIST_KEY: Symbol = symbol_short!("WLIST");
const ROUND_OPEN: Symbol = symbol_short!("OPEN");
const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const SYBIL_KEY: Symbol = symbol_short!("SYBIL");
const REVEAL_OPEN: Symbol = symbol_short!("REVEAL");

/// Domain separator prepended to every commitment preimage.
const COMMIT_DOMAIN: &[u8] = b"QF-COMMIT-V1";

/// Fixed-point scale for sqrt precision (6 decimal places).
const SCALE: i128 = 1_000_000;

// ── Data types ────────────────────────────────────────────────────────────────

/// Per-project funding data.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Project {
    /// Project owner / recipient of matched funds.
    pub owner: Address,
    /// Total direct donations received (unscaled).
    pub total_donations: i128,
    /// Sum of `sqrt(donation_i) * SCALE` for each contributor.
    pub sqrt_sum: i128,
    /// Map of donor → donation amount (sybil guard: one donation per donor).
    pub donors: Map<Address, i128>,
}

/// Persistent keys for per-(donor, project) commitments.
#[contracttype]
#[derive(Clone)]
pub enum QfKey {
    /// Commitment hash stored by `commit_donation`.
    Commit(Address, u32),
}

// ── Commitment helper ─────────────────────────────────────────────────────────

/// Builds the commit-reveal hash for a donation.
///
/// Preimage layout (byte-exact):
/// 1. `"QF-COMMIT-V1"` (12 bytes, ASCII domain separator)
/// 2. donor address, XDR-serialised (variable length)
/// 3. `project_id` as `u64`, big-endian (8 bytes)
/// 4. `amount` as `i128`, big-endian (16 bytes)
/// 5. `salt` (32 bytes)
///
/// The fields after the donor XDR have fixed lengths, so the encoding is
/// unambiguous. Returns `sha256(preimage)`.
pub fn commitment_hash(
    env: &Env,
    donor: &Address,
    project_id: u32,
    amount: i128,
    salt: &BytesN<32>,
) -> BytesN<32> {
    let mut preimage = Bytes::from_slice(env, COMMIT_DOMAIN);
    preimage.append(&donor.clone().to_xdr(env));
    preimage.append(&Bytes::from_array(env, &u64::from(project_id).to_be_bytes()));
    preimage.append(&Bytes::from_array(env, &amount.to_be_bytes()));
    preimage.append(&Bytes::from_array(env, &salt.to_array()));
    env.crypto().sha256(&preimage).to_bytes()
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct QuadraticFunding;

#[contractimpl]
impl QuadraticFunding {
    // ── Admin: initialise ─────────────────────────────────────────────────────

    /// Initialise a new funding round with a matching `pool`.
    ///
    /// The round starts in the commit phase (reveal not open).
    ///
    /// # Panics
    /// - If a round is already open.
    /// - If `pool` is not positive.
    pub fn init(env: Env, admin: Address, pool: i128) {
        admin.require_auth();
        assert!(pool > 0, "pool must be positive");
        assert!(
            !env.storage().instance().has(&ROUND_OPEN),
            "round already open"
        );
        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&POOL_KEY, &pool);
        env.storage()
            .instance()
            .set(&PROJECTS_KEY, &Map::<u32, Project>::new(&env));
        env.storage()
            .instance()
            .set(&WHITELIST_KEY, &Map::<Address, bool>::new(&env));
        env.storage().instance().set(&REVEAL_OPEN, &false);
        env.storage().instance().set(&ROUND_OPEN, &true);
        bump_instance(&env);
    }

    // ── Admin: sybil contract ─────────────────────────────────────────────────

    /// Configure the sybil-resistance contract consulted by `donate` and
    /// `reveal_donation`. The contract must expose `is_verified(Address) -> bool`.
    ///
    /// # Panics
    /// - If `admin` is not the round admin.
    pub fn set_sybil_contract(env: Env, admin: Address, sybil: Address) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        env.storage().instance().set(&SYBIL_KEY, &sybil);
        bump_instance(&env);
    }

    // ── Admin: register project ───────────────────────────────────────────────

    /// Register a new project with id `project_id`.
    ///
    /// # Panics
    /// - If the round is not open.
    /// - If the project id already exists.
    pub fn register_project(env: Env, admin: Address, project_id: u32, owner: Address) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        Self::assert_round_open(&env);

        let mut projects: Map<u32, Project> = env.storage().instance().get(&PROJECTS_KEY).unwrap();
        assert!(!projects.contains_key(project_id), "project already exists");

        projects.set(
            project_id,
            Project {
                owner,
                total_donations: 0,
                sqrt_sum: 0,
                donors: Map::new(&env),
            },
        );
        env.storage().instance().set(&PROJECTS_KEY, &projects);
        bump_instance(&env);
    }

    // ── Admin: whitelist donor ────────────────────────────────────────────────

    /// Add `donor` to the Sybil-resistance whitelist.
    pub fn whitelist_donor(env: Env, admin: Address, donor: Address) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        let mut wl: Map<Address, bool> = env.storage().instance().get(&WHITELIST_KEY).unwrap();
        wl.set(donor, true);
        env.storage().instance().set(&WHITELIST_KEY, &wl);
        bump_instance(&env);
    }

    // ── Donate ────────────────────────────────────────────────────────────────

    /// Donate `amount` to `project_id`.
    ///
    /// Each whitelisted address may donate to a given project at most once
    /// (Sybil resistance).
    ///
    /// # Panics
    /// - If the round is not open.
    /// - If `donor` is not whitelisted.
    /// - If a sybil contract is configured and `donor` is not sybil-verified.
    /// - If `donor` has already donated to this project.
    /// - If `amount` is not positive.
    pub fn donate(env: Env, donor: Address, project_id: u32, amount: i128) {
        donor.require_auth();
        Self::process_donation(&env, &donor, project_id, amount);
    }

    // ── Commit-reveal ─────────────────────────────────────────────────────────

    /// Commit to a future donation. Only allowed during the commit phase
    /// (before `open_reveal`). The commitment is `commitment_hash(...)`.
    ///
    /// # Panics
    /// - If the round is not open or the reveal phase has started.
    /// - If the project does not exist.
    /// - If `donor` already has a commitment for `project_id`.
    pub fn commit_donation(env: Env, donor: Address, project_id: u32, commitment: BytesN<32>) {
        donor.require_auth();
        Self::assert_round_open(&env);
        assert!(!Self::is_reveal_open(&env), "commit phase closed");

        let projects: Map<u32, Project> = env.storage().instance().get(&PROJECTS_KEY).unwrap();
        assert!(projects.contains_key(project_id), "project not found");

        let key = QfKey::Commit(donor.clone(), project_id);
        assert!(
            !env.storage().persistent().has(&key),
            "already committed to this project"
        );
        env.storage().persistent().set(&key, &commitment);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, INSTANCE_BUMP);

        env.events().publish(
            (symbol_short!("committed"), donor.clone()),
            project_id,
        );
        bump_instance(&env);
    }

    /// Close the commit phase and open the reveal phase. Admin only.
    ///
    /// # Panics
    /// - If `admin` is not the round admin.
    /// - If the round is not open.
    /// - If the reveal phase is already open.
    pub fn open_reveal(env: Env, admin: Address) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        Self::assert_round_open(&env);
        assert!(!Self::is_reveal_open(&env), "reveal already open");

        env.storage().instance().set(&REVEAL_OPEN, &true);
        bump_instance(&env);
    }

    /// Reveal a previously committed donation and apply it.
    ///
    /// The hash of `(donor, project_id, amount, salt)` must match the stored
    /// commitment. The commitment is consumed on success, so it cannot be replayed.
    ///
    /// # Panics
    /// - If the round is not open or the reveal phase is not open.
    /// - If there is no commitment for `(donor, project_id)`.
    /// - If the recomputed hash does not match the commitment (wrong salt/amount).
    /// - Any check performed by the donation path (whitelist, sybil, duplicate, amount).
    pub fn reveal_donation(
        env: Env,
        donor: Address,
        project_id: u32,
        amount: i128,
        salt: BytesN<32>,
    ) {
        donor.require_auth();
        Self::assert_round_open(&env);
        assert!(Self::is_reveal_open(&env), "reveal phase not open");

        let key = QfKey::Commit(donor.clone(), project_id);
        let committed: BytesN<32> = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no commitment for this donor and project");

        let digest = commitment_hash(&env, &donor, project_id, amount, &salt);
        assert!(digest == committed, "commitment mismatch");

        env.storage().persistent().remove(&key);
        Self::process_donation(&env, &donor, project_id, amount);
    }

    // ── Distribute ────────────────────────────────────────────────────────────

    /// Close the round and distribute the matching pool to projects.
    ///
    /// Returns a `Vec` of `(project_id, match_amount)` pairs, in project-id order.
    ///
    /// Each project receives `floor(pool × weight / total_weight)`. The rounding
    /// remainder (dust) is added to the project with the largest weight; ties go
    /// to the lowest project id. The payouts therefore always sum to exactly the
    /// pool. If no project has a non-zero weight, no payouts are made and the
    /// round still closes.
    ///
    /// The quadratic formula ensures that projects with **more unique donors**
    /// receive proportionally more matching, even if their total donation amount
    /// is equal to a project with fewer whale donors.
    ///
    /// # Panics
    /// - If `admin` is not the round admin.
    /// - If the round is not open.
    /// - On arithmetic overflow.
    pub fn distribute(env: Env, admin: Address) -> Vec<(u32, i128)> {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        Self::assert_round_open(&env);

        let pool: i128 = env.storage().instance().get(&POOL_KEY).unwrap();
        let projects: Map<u32, Project> = env.storage().instance().get(&PROJECTS_KEY).unwrap();

        // Compute match weight for each project: (sqrt_sum)² / SCALE².
        let mut total_weight: i128 = 0;
        let mut weights: Vec<(u32, i128)> = Vec::new(&env);

        for (id, project) in projects.iter() {
            let weight = project
                .sqrt_sum
                .checked_mul(project.sqrt_sum)
                .expect("overflow")
                .checked_div(SCALE * SCALE)
                .unwrap_or(0);
            weights.push_back((id, weight));
            total_weight = total_weight.checked_add(weight).expect("overflow");
        }

        let mut payouts: Vec<(u32, i128)> = Vec::new(&env);

        if total_weight == 0 {
            // No contributions: return empty payouts, close round.
            env.storage().instance().remove(&ROUND_OPEN);
            bump_instance(&env);
            return payouts;
        }

        // Pass 1: floor shares; track total distributed and the largest weight.
        let mut distributed: i128 = 0;
        let mut largest_idx: u32 = 0;
        let mut largest_weight: i128 = -1;
        for i in 0..weights.len() {
            let (id, weight) = weights.get(i).unwrap();
            let share = pool
                .checked_mul(weight)
                .expect("overflow")
                .checked_div(total_weight)
                .expect("division by zero");
            distributed = distributed.checked_add(share).expect("overflow");
            if weight > largest_weight {
                largest_weight = weight;
                largest_idx = i;
            }
            payouts.push_back((id, share));
        }

        // Pass 2: assign rounding dust to the largest-weight project.
        // distributed <= pool because every floor share is <= its exact share.
        let remainder = pool.checked_sub(distributed).expect("overflow");
        if remainder > 0 {
            let (id, share) = payouts.get(largest_idx).unwrap();
            let adjusted = share.checked_add(remainder).expect("overflow");
            payouts.set(largest_idx, (id, adjusted));
        }

        for (id, amount) in payouts.iter() {
            env.events().publish((symbol_short!("payout"),), (id, amount));
        }

        // Close the round.
        env.storage().instance().remove(&ROUND_OPEN);
        bump_instance(&env);

        payouts
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /// Returns the project data for `project_id`.
    pub fn get_project(env: Env, project_id: u32) -> Project {
        let projects: Map<u32, Project> = env.storage().instance().get(&PROJECTS_KEY).unwrap();
        projects.get(project_id).expect("project not found")
    }

    /// Returns the current matching pool size.
    pub fn get_pool(env: Env) -> i128 {
        env.storage().instance().get(&POOL_KEY).unwrap_or(0)
    }

    /// Returns `true` once the reveal phase has been opened.
    pub fn is_reveal_phase(env: Env) -> bool {
        Self::is_reveal_open(&env)
    }

    // ── SC-037 Penalty Slasher & Collusion Detection ──────────────────────────

    /// Deposit security stake for a donor.
    pub fn deposit_stake(env: Env, donor: Address, amount: i128) {
        slasher::deposit_stake(&env, &donor, amount);
    }

    /// Query current security stake for a donor.
    pub fn get_stake(env: Env, donor: Address) -> i128 {
        slasher::get_stake(&env, &donor)
    }

    /// Check if a donor is slashed.
    pub fn is_slashed(env: Env, donor: Address) -> bool {
        slasher::is_slashed(&env, &donor)
    }

    /// Slash collusive cluster accounts, disqualify donations, and award 50% bounty.
    pub fn slash_collusion(
        env: Env,
        investigator: Address,
        project_id: u32,
        colluders: Vec<Address>,
        proof: CollusionProof,
    ) -> Result<i128, SlasherError> {
        Self::assert_round_open(&env);
        slasher::slash_collusion(&env, &investigator, project_id, &colluders, &proof)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Shared donation path used by `donate` and `reveal_donation`.
    /// Performs no authentication; callers must `require_auth` first.
    fn process_donation(env: &Env, donor: &Address, project_id: u32, amount: i128) {
        Self::assert_round_open(env);
        assert!(amount > 0, "amount must be positive");

        // Whitelist check.
        let wl: Map<Address, bool> = env.storage().instance().get(&WHITELIST_KEY).unwrap();
        assert!(
            wl.get(donor.clone()).unwrap_or(false),
            "donor not whitelisted"
        );

        // Sybil-resistance contract check (when configured).
        Self::check_sybil(env, donor);

        let mut projects: Map<u32, Project> = env.storage().instance().get(&PROJECTS_KEY).unwrap();
        let mut project = projects.get(project_id).expect("project not found");

        // One donation per donor per project (Sybil guard).
        assert!(
            !project.donors.contains_key(donor.clone()),
            "already donated to this project"
        );

        project.donors.set(donor.clone(), amount);
        project.total_donations = project
            .total_donations
            .checked_add(amount)
            .expect("overflow");

        // sqrt_sum += isqrt(amount * SCALE²) = isqrt(amount) * SCALE
        let scaled = amount
            .checked_mul(SCALE)
            .and_then(|v| v.checked_mul(SCALE))
            .expect("overflow");
        let sqrt_contribution = Self::isqrt(scaled);
        project.sqrt_sum = project
            .sqrt_sum
            .checked_add(sqrt_contribution)
            .expect("overflow");

        projects.set(project_id, project);
        env.storage().instance().set(&PROJECTS_KEY, &projects);

        env.events()
            .publish((symbol_short!("donated"), donor.clone()), (project_id, amount));
        bump_instance(env);
    }

    /// Calls `is_verified(donor)` on the configured sybil contract, if any.
    /// Panics if the donor is not verified. Does nothing when no contract is set.
    fn check_sybil(env: &Env, donor: &Address) {
        let sybil: Option<Address> = env.storage().instance().get(&SYBIL_KEY);
        if let Some(sybil_contract) = sybil {
            let verified: bool = env.invoke_contract(
                &sybil_contract,
                &Symbol::new(env, "is_verified"),
                soroban_sdk::vec![env, donor.into_val(env)],
            );
            assert!(verified, "donor not sybil verified");
        }
    }

    /// Integer square root via the bitwise digit method (no floating point,
    /// no unchecked `x + 1` or `x + n / x` steps).
    ///
    /// Returns `floor(sqrt(n))`, or `0` for `n <= 0`.
    pub(crate) fn isqrt(n: i128) -> i128 {
        if n <= 0 {
            return 0;
        }
        let mut num = n as u128;
        let mut res: u128 = 0;
        // Highest power of four <= num. Every intermediate stays below 2^127.
        let mut bit: u128 = 1u128 << 126;
        while bit > num {
            bit >>= 2;
        }
        while bit != 0 {
            let candidate = res.checked_add(bit).expect("overflow");
            if num >= candidate {
                num = num.checked_sub(candidate).expect("overflow");
                res = (res >> 1).checked_add(bit).expect("overflow");
            } else {
                res >>= 1;
            }
            bit >>= 2;
        }
        // The root of a positive i128 is at most 2^63, so this cast is lossless.
        res as i128
    }

    fn is_reveal_open(env: &Env) -> bool {
        env.storage()
            .instance()
            .get::<Symbol, bool>(&REVEAL_OPEN)
            .unwrap_or(false)
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&ADMIN_KEY).expect("no admin");
        assert!(admin == *caller, "not admin");
    }

    fn assert_round_open(env: &Env) {
        assert!(
            env.storage()
                .instance()
                .get::<Symbol, bool>(&ROUND_OPEN)
                .unwrap_or(false),
            "round not open"
        );
    }
}

// ── Modules ───────────────────────────────────────────────────────────────────

pub mod collusion_detection;
pub mod slasher;

pub use collusion_detection::*;
pub use slasher::*;

// ── TTL helper (SC-HARD-16) ───────────────────────────────────────────────────

pub(crate) fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, INSTANCE_BUMP);
}

// ── Tests (in separate file per issue requirements) ───────────────────────────

#[cfg(test)]
mod test;
