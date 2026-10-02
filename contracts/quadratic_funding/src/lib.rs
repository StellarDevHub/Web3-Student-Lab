#![no_std]

//! # Quadratic Funding & Voting Allocation Engine — SC-HARD-14
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
//! The matching pool is then distributed proportionally:
//!
//! ```text
//! payout(p) = match(p) / Σ_all_projects match(q)  ×  pool
//! ```
//!
//! ## Sybil Resistance
//! Each address may donate to a given project **at most once** per round.
//! The admin maintains a whitelist of approved donors; only whitelisted
//! addresses may contribute.
//!
//! ## Security
//! - Integer overflow: all arithmetic uses `checked_*`.
//! - Precision: square-root is computed with integer Newton's method scaled
//!   by `SCALE = 1_000_000` to preserve 6 decimal places of precision.
//! - No external calls during state mutation.
//!
//! ## Storage TTL (SC-HARD-16)
//! Every state-mutating call bumps instance TTL beyond 100,000 ledgers to
//! protect against automatic ledger state archival on Stellar Mainnet.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol, Vec,
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

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct QuadraticFunding;

#[contractimpl]
impl QuadraticFunding {
    // ── Admin: initialise ─────────────────────────────────────────────────────

    /// Initialise a new funding round with a matching `pool`.
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
        env.storage().instance().set(&ROUND_OPEN, &true);
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

        let mut projects: Map<u32, Project> =
            env.storage().instance().get(&PROJECTS_KEY).unwrap();
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
        let mut wl: Map<Address, bool> =
            env.storage().instance().get(&WHITELIST_KEY).unwrap();
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
    /// - If `donor` has already donated to this project.
    /// - If `amount` is not positive.
    pub fn donate(env: Env, donor: Address, project_id: u32, amount: i128) {
        donor.require_auth();
        Self::assert_round_open(&env);
        assert!(amount > 0, "amount must be positive");

        // Sybil check
        let wl: Map<Address, bool> = env.storage().instance().get(&WHITELIST_KEY).unwrap();
        assert!(
            wl.get(donor.clone()).unwrap_or(false),
            "donor not whitelisted"
        );

        let mut projects: Map<u32, Project> =
            env.storage().instance().get(&PROJECTS_KEY).unwrap();
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
        let sqrt_contribution =
            Self::isqrt(amount.checked_mul(SCALE * SCALE).expect("overflow"));
        project.sqrt_sum = project
            .sqrt_sum
            .checked_add(sqrt_contribution)
            .expect("overflow");

        projects.set(project_id, project);
        env.storage().instance().set(&PROJECTS_KEY, &projects);

        env.events()
            .publish((symbol_short!("donated"), donor), (project_id, amount));
        bump_instance(&env);
    }

    // ── Distribute ────────────────────────────────────────────────────────────

    /// Close the round and distribute the matching pool to projects.
    ///
    /// Returns a `Vec` of `(project_id, match_amount)` pairs.
    ///
    /// The quadratic formula ensures that projects with **more unique donors**
    /// receive proportionally more matching, even if their total donation amount
    /// is equal to a project with fewer whale donors. This maximises capital
    /// allocation toward community-favored public goods.
    ///
    /// # Panics
    /// - If the round is not open.
    pub fn distribute(env: Env, admin: Address) -> Vec<(u32, i128)> {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        Self::assert_round_open(&env);

        let pool: i128 = env.storage().instance().get(&POOL_KEY).unwrap();
        let projects: Map<u32, Project> = env.storage().instance().get(&PROJECTS_KEY).unwrap();

        // Compute match weight for each project: (sqrt_sum)²
        let mut total_weight: i128 = 0;
        let mut weights: Vec<(u32, i128)> = Vec::new(&env);

        for (id, project) in projects.iter() {
            // weight = (sqrt_sum)² / SCALE² normalises back to token units.
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

        for i in 0..weights.len() {
            let (id, weight) = weights.get(i).unwrap();
            let match_amount = pool
                .checked_mul(weight)
                .expect("overflow")
                .checked_div(total_weight)
                .unwrap_or(0);
            payouts.push_back((id, match_amount));
            env.events()
                .publish((symbol_short!("payout"),), (id, match_amount));
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

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Integer square root via Newton's method (no floating point).
    ///
    /// Returns `floor(sqrt(n))`.
    pub(crate) fn isqrt(n: i128) -> i128 {
        if n <= 0 {
            return 0;
        }
        let mut x = n;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + n / x) / 2;
        }
        x
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

// ── TTL helper (SC-HARD-16) ───────────────────────────────────────────────────

pub(crate) fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, INSTANCE_BUMP);
}

// ── Tests (in separate file per issue requirements) ───────────────────────────

#[cfg(test)]
mod tests;
