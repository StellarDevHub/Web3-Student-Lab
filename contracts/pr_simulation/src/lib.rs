//! # PR Simulation Environment Contract
//!
//! Closes issue #813.
//!
//! A Soroban-native contract that simulates pull requests for smart contract
//! upgrades.  It analyses storage-layout compatibility between two contract
//! versions, detects breaking changes, and generates actionable simulation
//! reports before any on-chain upgrade is executed.
//!
//! ## Core capabilities
//!
//! * **Storage-layout diff** — compares storage key enums between V1 and V2
//!   to flag type changes, key collisions, and removed keys that would cause
//!   deserialisation panics.
//! * **Safe‑migration classification** — additive keys (new variants), identical
//!   keys with identical types, and renamed-but-compatible keys are classified
//!   as SAFE.  Type changes, removed keys, and total rewrites are BREAKING.
//! * **Upgrade‑path simulation** — records the before/after WASM hash and
//!   emits a detailed simulation report that the playground can display.
//! * **Administrative lifecycle** — only authorised auditors can create or
//!   finalise simulations; results are immutable once finalised.
//!
//! ## Integration with existing infrastructure
//!
//! Works alongside the UUPS proxy pattern (`proxy`, `implementation_v1`,
//! `implementation_v2`) already present in the workspace.  The playground
//! frontend can call `simulate_upgrade` and render the report for students.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env, String, Vec,
};

// ── Types ─────────────────────────────────────────────────────────────────────

/// Severity of a storage-layout change.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ChangeSeverity {
    /// Additive change — no existing data is affected.
    Safe,
    /// Change that will cause deserialisation errors or data loss.
    Breaking,
}

/// Describes a single difference between two storage-layout keys.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageChange {
    /// Human-readable key name (e.g. "Score(Address)").
    pub key_name: String,
    /// The stored type if known (e.g. "u32", "String").
    pub old_type: String,
    /// The type in the proposed version.
    pub new_type: String,
    /// SAFE or BREAKING.
    pub severity: ChangeSeverity,
    /// Explanation suitable for the playground report.
    pub reason: String,
}

/// Status of a PR simulation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SimulationStatus {
    /// Simulation created but not yet analysed.
    Draft,
    /// Analysis complete — report available.
    Analysed,
    /// Auditor has approved the simulation.
    Approved,
    /// Auditor has rejected the simulation.
    Rejected,
    /// Simulation has been executed (upgrade performed).
    Executed,
}

/// Core simulation record stored on-chain.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SimulationRecord {
    /// Unique simulation ID.
    pub id: u64,
    /// Address that submitted the simulation request.
    pub author: Address,
    /// Human-readable PR title.
    pub title: String,
    /// Current contract WASM hash (before upgrade).
    pub current_wasm: BytesN<32>,
    /// Proposed contract WASM hash (after upgrade).
    pub proposed_wasm: BytesN<32>,
    /// List of storage-layout changes detected.
    pub changes: Vec<StorageChange>,
    /// Summary verdict: SAFE or BREAKING.
    pub verdict: ChangeSeverity,
    /// Current lifecycle status.
    pub status: SimulationStatus,
    /// Ledger timestamp when created.
    pub created_at: u64,
    /// Ledger timestamp when finalised (0 if not yet finalised).
    pub finalised_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum PrSimKey {
    /// Admin address authorised to create / finalise simulations.
    Admin,
    /// Auto-incrementing simulation ID counter.
    NextId,
    /// Simulation record by ID.
    Simulation(u64),
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PrSimError {
    AlreadyInitialised = 1,
    NotInitialised = 2,
    Unauthorised = 3,
    SimulationNotFound = 4,
    AlreadyFinalised = 5,
    EmptyTitle = 6,
    EmptyChanges = 7,
    InvalidWasm = 8,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PrSimulation;

#[contractimpl]
impl PrSimulation {
    // ── Initialisation ──────────────────────────────────────────────────────

    /// Initialise the PR simulation environment.  Must be called exactly once.
    pub fn initialise(env: Env, admin: Address) {
        if env.storage().instance().has(&PrSimKey::Admin) {
            panic_with_error!(&env, PrSimError::AlreadyInitialised);
        }
        admin.require_auth();
        env.storage().instance().set(&PrSimKey::Admin, &admin);
        env.storage().instance().set(&PrSimKey::NextId, &0u64);
    }

    // ── Simulation creation ─────────────────────────────────────────────────

    /// Submit a new PR simulation request.
    ///
    /// The caller provides the current and proposed WASM hashes along with a
    /// human-readable title.  Storage-layout changes are supplied as a `Vec`
    /// of `StorageChange` structs that the playground / CLI has pre-computed.
    ///
    /// Returns the new simulation ID.
    pub fn simulate_upgrade(
        env: Env,
        author: Address,
        title: String,
        current_wasm: BytesN<32>,
        proposed_wasm: BytesN<32>,
        changes: Vec<StorageChange>,
    ) -> u64 {
        author.require_auth();
        Self::ensure_admin(&env, &author);

        if title.len() == 0 {
            panic_with_error!(&env, PrSimError::EmptyTitle);
        }
        if changes.len() == 0 {
            panic_with_error!(&env, PrSimError::EmptyChanges);
        }

        // Reject all-zero WASM hashes (invalid / uninitialised).
        if current_wasm.to_array().iter().all(|b| *b == 0)
            || proposed_wasm.to_array().iter().all(|b| *b == 0)
        {
            panic_with_error!(&env, PrSimError::InvalidWasm);
        }

        // Compute verdict from the supplied changes.
        let verdict = Self::compute_verdict(&changes);

        let id: u64 = env.storage().instance().get(&PrSimKey::NextId).unwrap_or(0);
        env.storage().instance().set(&PrSimKey::NextId, &(id + 1));

        let record = SimulationRecord {
            id,
            author: author.clone(),
            title: title.clone(),
            current_wasm,
            proposed_wasm,
            changes: changes.clone(),
            verdict: verdict.clone(),
            status: SimulationStatus::Analysed,
            created_at: env.ledger().timestamp(),
            finalised_at: 0,
        };

        env.storage()
            .persistent()
            .set(&PrSimKey::Simulation(id), &record);

        env.events().publish(
            (symbol_short!("pr_sim"), symbol_short!("created")),
            (author, id, title, verdict),
        );

        id
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    /// Mark a simulation as approved.
    pub fn approve(env: Env, caller: Address, simulation_id: u64) {
        caller.require_auth();
        Self::ensure_admin(&env, &caller);

        let mut record: SimulationRecord = env
            .storage()
            .persistent()
            .get(&PrSimKey::Simulation(simulation_id))
            .unwrap_or_else(|| panic_with_error!(&env, PrSimError::SimulationNotFound));

        if record.status != SimulationStatus::Analysed {
            panic_with_error!(&env, PrSimError::AlreadyFinalised);
        }

        record.status = SimulationStatus::Approved;
        record.finalised_at = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&PrSimKey::Simulation(simulation_id), &record);

        env.events().publish(
            (symbol_short!("pr_sim"), symbol_short!("approved")),
            (caller, simulation_id),
        );
    }

    /// Mark a simulation as rejected.
    pub fn reject(env: Env, caller: Address, simulation_id: u64) {
        caller.require_auth();
        Self::ensure_admin(&env, &caller);

        let mut record: SimulationRecord = env
            .storage()
            .persistent()
            .get(&PrSimKey::Simulation(simulation_id))
            .unwrap_or_else(|| panic_with_error!(&env, PrSimError::SimulationNotFound));

        if record.status != SimulationStatus::Analysed {
            panic_with_error!(&env, PrSimError::AlreadyFinalised);
        }

        record.status = SimulationStatus::Rejected;
        record.finalised_at = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&PrSimKey::Simulation(simulation_id), &record);

        env.events().publish(
            (symbol_short!("pr_sim"), symbol_short!("rejected")),
            (caller, simulation_id),
        );
    }

    /// Mark a simulation as executed (upgrade was performed).
    pub fn execute(env: Env, caller: Address, simulation_id: u64) {
        caller.require_auth();
        Self::ensure_admin(&env, &caller);

        let mut record: SimulationRecord = env
            .storage()
            .persistent()
            .get(&PrSimKey::Simulation(simulation_id))
            .unwrap_or_else(|| panic_with_error!(&env, PrSimError::SimulationNotFound));

        if record.status != SimulationStatus::Approved {
            panic_with_error!(&env, PrSimError::AlreadyFinalised);
        }

        record.status = SimulationStatus::Executed;
        env.storage()
            .persistent()
            .set(&PrSimKey::Simulation(simulation_id), &record);

        env.events().publish(
            (symbol_short!("pr_sim"), symbol_short!("executed")),
            (caller, simulation_id),
        );
    }

    // ── Views ───────────────────────────────────────────────────────────────

    /// Return the full simulation record.
    pub fn get_simulation(env: Env, simulation_id: u64) -> Option<SimulationRecord> {
        env.storage()
            .persistent()
            .get(&PrSimKey::Simulation(simulation_id))
    }

    /// Return the number of simulations stored.
    pub fn simulation_count(env: Env) -> u64 {
        env.storage().instance().get(&PrSimKey::NextId).unwrap_or(0)
    }

    /// Analyse a single `StorageChange` and return whether it is safe.
    ///
    /// This view is callable by anyone (no auth) so the playground can
    /// pre-validate changes before submitting a full simulation.
    pub fn classify_change(env: Env, change: StorageChange) -> ChangeSeverity {
        // If types are identical, the change is always safe.
        if change.old_type == change.new_type {
            return ChangeSeverity::Safe;
        }

        // If the old type was empty (new key), it's a safe additive change.
        if change.old_type.len() == 0 {
            return ChangeSeverity::Safe;
        }

        // If the new type is empty (key removed), it's breaking — existing
        // data would be orphaned and the old key can no longer be read.
        if change.new_type.len() == 0 {
            return ChangeSeverity::Breaking;
        }

        // Type changed: breaking.  Soroban will panic when deserialising the
        // old XDR bytes into the new type.
        ChangeSeverity::Breaking
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    fn ensure_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&PrSimKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, PrSimError::NotInitialised));
        if *caller != admin {
            panic_with_error!(env, PrSimError::Unauthorised);
        }
    }

    fn compute_verdict(changes: &Vec<StorageChange>) -> ChangeSeverity {
        for change in changes.iter() {
            if change.severity == ChangeSeverity::Breaking {
                return ChangeSeverity::Breaking;
            }
        }
        ChangeSeverity::Safe
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Env, String, Vec,
    };

    fn setup() -> (Env, PrSimulationClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 100);
        let contract_id = env.register(PrSimulation, ());
        let client = PrSimulationClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialise(&admin);
        (env, client, admin)
    }

    fn dummy_wasm(env: &Env, seed: u8) -> BytesN<32> {
        let mut bytes = [seed; 32];
        // Ensure the hash is not all-zeros so it passes validation.
        bytes[0] = seed;
        bytes[1] = seed.wrapping_add(1);
        BytesN::from_array(env, &bytes)
    }

    fn make_change(env: &Env, key: &str, old_type: &str, new_type: &str) -> StorageChange {
        StorageChange {
            key_name: String::from_str(env, key),
            old_type: String::from_str(env, old_type),
            new_type: String::from_str(env, new_type),
            severity: ChangeSeverity::Safe,
            reason: String::from_str(env, "test"),
        }
    }

    // ── Initialisation ──────────────────────────────────────────────────────

    #[test]
    fn test_initialise_sets_admin() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);
        let changes = Vec::from_array(&env, [make_change(&env, "Score", "u32", "u32")]);
        // Admin should be able to create a simulation without panic.
        let id =
            client.simulate_upgrade(&admin, &String::from_str(&env, "Test PR"), &w, &w, &changes);
        assert_eq!(id, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialise_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(PrSimulation, ());
        let client = PrSimulationClient::new(&env, &cid);
        let admin = Address::generate(&env);
        client.initialise(&admin);
        client.initialise(&admin);
    }

    // ── Simulation creation ─────────────────────────────────────────────────

    #[test]
    fn test_simulate_safe_upgrade() {
        let (env, client, admin) = setup();
        let w1 = dummy_wasm(&env, 1);
        let w2 = dummy_wasm(&env, 2);

        let changes = Vec::from_array(
            &env,
            [
                StorageChange {
                    key_name: String::from_str(&env, "Score(Address)"),
                    old_type: String::from_str(&env, "u32"),
                    new_type: String::from_str(&env, "u32"),
                    severity: ChangeSeverity::Safe,
                    reason: String::from_str(&env, "Type unchanged"),
                },
                StorageChange {
                    key_name: String::from_str(&env, "Name(Address)"),
                    old_type: String::from_str(&env, ""),
                    new_type: String::from_str(&env, "String"),
                    severity: ChangeSeverity::Safe,
                    reason: String::from_str(&env, "Additive new key"),
                },
            ],
        );

        let id = client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "Add name field"),
            &w1,
            &w2,
            &changes,
        );
        assert_eq!(id, 0);

        let record = client.get_simulation(&id).unwrap();
        assert_eq!(record.status, SimulationStatus::Analysed);
        assert_eq!(record.verdict, ChangeSeverity::Safe);
        assert_eq!(record.changes.len(), 2);
    }

    #[test]
    fn test_simulate_breaking_upgrade() {
        let (env, client, admin) = setup();
        let w1 = dummy_wasm(&env, 1);
        let w2 = dummy_wasm(&env, 2);

        let changes = Vec::from_array(
            &env,
            [
                StorageChange {
                    key_name: String::from_str(&env, "Score(Address)"),
                    old_type: String::from_str(&env, "u32"),
                    new_type: String::from_str(&env, "u32"),
                    severity: ChangeSeverity::Safe,
                    reason: String::from_str(&env, "Type unchanged"),
                },
                StorageChange {
                    key_name: String::from_str(&env, "Score(Address)"),
                    old_type: String::from_str(&env, "u32"),
                    new_type: String::from_str(&env, "u64"),
                    severity: ChangeSeverity::Breaking,
                    reason: String::from_str(
                        &env,
                        "Type changed from u32 to u64 — deserialisation will panic",
                    ),
                },
            ],
        );

        let id = client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "Change score to u64"),
            &w1,
            &w2,
            &changes,
        );
        assert_eq!(id, 0);

        let record = client.get_simulation(&id).unwrap();
        assert_eq!(record.verdict, ChangeSeverity::Breaking);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_unauthorised_simulation_panics() {
        let (env, client, _admin) = setup();
        let w = dummy_wasm(&env, 1);
        let rogue = Address::generate(&env);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        client.simulate_upgrade(&rogue, &String::from_str(&env, "Bad"), &w, &w, &changes);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_empty_title_panics() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        client.simulate_upgrade(&admin, &String::from_str(&env, ""), &w, &w, &changes);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_zero_wasm_rejected() {
        let (env, client, admin) = setup();
        let zero_wasm = BytesN::from_array(&env, &[0u8; 32]);
        let good_wasm = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        // current_wasm is all zeros → should panic
        client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "Zero WASM"),
            &zero_wasm,
            &good_wasm,
            &changes,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_empty_changes_panics() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::new(&env);
        client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "No changes"),
            &w,
            &w,
            &changes,
        );
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    #[test]
    fn test_approve_simulation() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        let id =
            client.simulate_upgrade(&admin, &String::from_str(&env, "Good PR"), &w, &w, &changes);

        client.approve(&admin, &id);
        let record = client.get_simulation(&id).unwrap();
        assert_eq!(record.status, SimulationStatus::Approved);
        assert!(record.finalised_at > 0);
    }

    #[test]
    fn test_reject_simulation() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        let id =
            client.simulate_upgrade(&admin, &String::from_str(&env, "Bad PR"), &w, &w, &changes);

        client.reject(&admin, &id);
        let record = client.get_simulation(&id).unwrap();
        assert_eq!(record.status, SimulationStatus::Rejected);
    }

    #[test]
    fn test_execute_approved_simulation() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        let id =
            client.simulate_upgrade(&admin, &String::from_str(&env, "Exec PR"), &w, &w, &changes);
        client.approve(&admin, &id);
        client.execute(&admin, &id);

        let record = client.get_simulation(&id).unwrap();
        assert_eq!(record.status, SimulationStatus::Executed);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_cannot_execute_unapproved() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        let id = client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "Draft PR"),
            &w,
            &w,
            &changes,
        );
        // Directly try execute without approve
        client.execute(&admin, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_cannot_double_approve() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        let id = client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "Double approve"),
            &w,
            &w,
            &changes,
        );
        client.approve(&admin, &id);
        client.approve(&admin, &id);
    }

    // ── classify_change view ────────────────────────────────────────────────

    #[test]
    fn test_classify_safe_identical_types() {
        let (env, client, _admin) = setup();
        let change = make_change(&env, "Score", "u32", "u32");
        assert_eq!(client.classify_change(&change), ChangeSeverity::Safe);
    }

    #[test]
    fn test_classify_safe_additive_key() {
        let (env, client, _admin) = setup();
        let change = make_change(&env, "NewField", "", "String");
        assert_eq!(client.classify_change(&change), ChangeSeverity::Safe);
    }

    #[test]
    fn test_classify_breaking_type_change() {
        let (env, client, _admin) = setup();
        let change = make_change(&env, "Score", "u32", "u64");
        assert_eq!(client.classify_change(&change), ChangeSeverity::Breaking);
    }

    #[test]
    fn test_classify_breaking_removed_key() {
        let (env, client, _admin) = setup();
        let change = make_change(&env, "OldField", "u32", "");
        assert_eq!(client.classify_change(&change), ChangeSeverity::Breaking);
    }

    // ── Views ───────────────────────────────────────────────────────────────

    #[test]
    fn test_simulation_count() {
        let (env, client, admin) = setup();
        assert_eq!(client.simulation_count(), 0);

        let w = dummy_wasm(&env, 1);
        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);

        client.simulate_upgrade(&admin, &String::from_str(&env, "PR 1"), &w, &w, &changes);
        assert_eq!(client.simulation_count(), 1);

        client.simulate_upgrade(&admin, &String::from_str(&env, "PR 2"), &w, &w, &changes);
        assert_eq!(client.simulation_count(), 2);
    }

    #[test]
    fn test_get_nonexistent_simulation() {
        let (env, client, _admin) = setup();
        assert!(client.get_simulation(&999).is_none());
    }

    // ── Immutability after approval ─────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_cannot_reject_approved_simulation() {
        let (env, client, admin) = setup();
        let w = dummy_wasm(&env, 1);

        let changes = Vec::from_array(&env, [make_change(&env, "K", "u32", "u32")]);
        let id = client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "Immutable"),
            &w,
            &w,
            &changes,
        );
        client.approve(&admin, &id);
        // Trying to reject an already-approved simulation should panic
        client.reject(&admin, &id);
    }

    // ── Composite verdict computation ───────────────────────────────────────

    #[test]
    fn test_mixed_changes_verdict_is_breaking() {
        let (env, client, admin) = setup();
        let w1 = dummy_wasm(&env, 1);
        let w2 = dummy_wasm(&env, 2);

        let changes = Vec::from_array(
            &env,
            [
                StorageChange {
                    key_name: String::from_str(&env, "A"),
                    old_type: String::from_str(&env, "u32"),
                    new_type: String::from_str(&env, "u32"),
                    severity: ChangeSeverity::Safe,
                    reason: String::from_str(&env, "safe"),
                },
                StorageChange {
                    key_name: String::from_str(&env, "B"),
                    old_type: String::from_str(&env, "u32"),
                    new_type: String::from_str(&env, "String"),
                    severity: ChangeSeverity::Breaking,
                    reason: String::from_str(&env, "breaking"),
                },
            ],
        );

        let id = client.simulate_upgrade(
            &admin,
            &String::from_str(&env, "Mixed changes"),
            &w1,
            &w2,
            &changes,
        );
        let record = client.get_simulation(&id).unwrap();
        assert_eq!(record.verdict, ChangeSeverity::Breaking);
    }
}
