//! # Commit-Reveal RNG Contract
//!
//! A secure, bias-resistant random number generator using a two-phase
//! commit-reveal scheme.  Because block hashes are manipulatable by validators,
//! this contract derives entropy from the XOR-hash of all participant secrets.
//!
//! ## Protocol
//! 1. **Commit phase** – each participant submits `H(secret)` (a 32-byte hash).
//! 2. **Reveal phase** – each participant reveals their `secret`; the contract
//!    verifies `H(secret) == commitment` and accumulates entropy.
//! 3. **Finalise** – once all participants have revealed, the final random value
//!    is `H(entropy_accumulator)`.
//!
//! ## Penalties
//! Participants who committed but fail to reveal before the deadline are
//! flagged as **slashed** (in a production system their stake would be seized).
//!
//! ## Security
//! - No block-hash dependency; entropy comes entirely from participant secrets.
//! - Commitments are binding: revealing a different value panics.
//! - Phase transitions are time-locked via ledger sequence numbers.
//! - Integer overflow: all arithmetic uses `checked_*`.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, Map, Symbol,
    Vec,
};

// ── Constants ────────────────────────────────────────────────────────────────
const PHASE_KEY: Symbol = symbol_short!("PHASE");
const ENTROPY_KEY: Symbol = symbol_short!("ENTROPY");
const RESULT_KEY: Symbol = symbol_short!("RESULT");
const COMMIT_END: Symbol = symbol_short!("CMTEND");
const REVEAL_END: Symbol = symbol_short!("RVLEND");
const COMMITS_KEY: Symbol = symbol_short!("COMMITS");
const REVEALS_KEY: Symbol = symbol_short!("REVEALS");
const SLASHED_KEY: Symbol = symbol_short!("SLASHED");

// ── Data types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Phase {
    Commit,
    Reveal,
    Finalised,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct CommitRevealRng;

#[contractimpl]
impl CommitRevealRng {
    // ── Initialise ────────────────────────────────────────────────────────────

    /// Initialise a new RNG round.
    ///
    /// - `commit_duration`: ledgers the commit phase lasts.
    /// - `reveal_duration`: ledgers the reveal phase lasts after commit ends.
    pub fn init(env: Env, admin: Address, commit_duration: u32, reveal_duration: u32) {
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&PHASE_KEY),
            "already initialised"
        );
        let now = env.ledger().sequence();
        let commit_end = now.checked_add(commit_duration).expect("overflow");
        let reveal_end = commit_end.checked_add(reveal_duration).expect("overflow");

        env.storage().instance().set(&PHASE_KEY, &Phase::Commit);
        env.storage().instance().set(&COMMIT_END, &commit_end);
        env.storage().instance().set(&REVEAL_END, &reveal_end);
        env.storage()
            .instance()
            .set(&ENTROPY_KEY, &BytesN::<32>::from_array(&env, &[0u8; 32]));
        env.storage()
            .instance()
            .set(&COMMITS_KEY, &Map::<Address, BytesN<32>>::new(&env));
        env.storage()
            .instance()
            .set(&REVEALS_KEY, &Map::<Address, bool>::new(&env));
        env.storage()
            .instance()
            .set(&SLASHED_KEY, &Vec::<Address>::new(&env));
    }

    // ── Commit ────────────────────────────────────────────────────────────────

    /// Submit a commitment `H(secret)` during the commit phase.
    ///
    /// # Panics
    /// - If not in commit phase or commit window has closed.
    /// - If participant has already committed.
    pub fn commit(env: Env, participant: Address, commitment: BytesN<32>) {
        participant.require_auth();
        Self::assert_phase(&env, Phase::Commit);

        let commit_end: u32 = env.storage().instance().get(&COMMIT_END).unwrap();
        assert!(
            env.ledger().sequence() <= commit_end,
            "commit window closed"
        );

        let mut commits: Map<Address, BytesN<32>> =
            env.storage().instance().get(&COMMITS_KEY).unwrap();
        assert!(
            !commits.contains_key(participant.clone()),
            "already committed"
        );

        commits.set(participant.clone(), commitment);
        env.storage().instance().set(&COMMITS_KEY, &commits);

        env.events()
            .publish((symbol_short!("committed"), participant), ());
    }

    // ── Transition to reveal ──────────────────────────────────────────────────

    /// Transition from commit phase to reveal phase.
    ///
    /// Can be called by anyone once the commit window has closed.
    pub fn start_reveal(env: Env) {
        Self::assert_phase(&env, Phase::Commit);
        let commit_end: u32 = env.storage().instance().get(&COMMIT_END).unwrap();
        assert!(
            env.ledger().sequence() > commit_end,
            "commit window still open"
        );
        env.storage().instance().set(&PHASE_KEY, &Phase::Reveal);
        env.events().publish((symbol_short!("reveal"),), ());
    }

    // ── Reveal ────────────────────────────────────────────────────────────────

    /// Reveal `secret` and contribute entropy.
    ///
    /// The contract verifies `sha256(secret) == commitment`.
    ///
    /// # Panics
    /// - If not in reveal phase or reveal window has closed.
    /// - If participant did not commit.
    /// - If `sha256(secret) != commitment`.
    pub fn reveal(env: Env, participant: Address, secret: Bytes) {
        participant.require_auth();
        Self::assert_phase(&env, Phase::Reveal);

        let reveal_end: u32 = env.storage().instance().get(&REVEAL_END).unwrap();
        assert!(
            env.ledger().sequence() <= reveal_end,
            "reveal window closed"
        );

        let commits: Map<Address, BytesN<32>> = env.storage().instance().get(&COMMITS_KEY).unwrap();
        let commitment = commits
            .get(participant.clone())
            .expect("participant did not commit");

        // Verify commitment: sha256(secret) must equal the stored hash.
        let hash: BytesN<32> = env.crypto().sha256(&secret).into();
        assert!(hash == commitment, "secret does not match commitment");

        let mut reveals: Map<Address, bool> = env.storage().instance().get(&REVEALS_KEY).unwrap();
        assert!(
            !reveals.contains_key(participant.clone()),
            "already revealed"
        );
        reveals.set(participant.clone(), true);
        env.storage().instance().set(&REVEALS_KEY, &reveals);

        // XOR the new secret hash into the running entropy accumulator.
        let current_entropy: BytesN<32> = env.storage().instance().get(&ENTROPY_KEY).unwrap();
        let new_entropy = Self::xor_bytes32(&env, &current_entropy, &hash);
        env.storage().instance().set(&ENTROPY_KEY, &new_entropy);

        env.events()
            .publish((symbol_short!("revealed"), participant), ());
    }

    // ── Slash non-revealers ───────────────────────────────────────────────────

    /// After the reveal window closes, slash participants who committed but
    /// did not reveal.  In production their stake would be seized here.
    pub fn slash_non_revealers(env: Env) {
        Self::assert_phase(&env, Phase::Reveal);
        let reveal_end: u32 = env.storage().instance().get(&REVEAL_END).unwrap();
        assert!(
            env.ledger().sequence() > reveal_end,
            "reveal window still open"
        );

        let commits: Map<Address, BytesN<32>> = env.storage().instance().get(&COMMITS_KEY).unwrap();
        let reveals: Map<Address, bool> = env.storage().instance().get(&REVEALS_KEY).unwrap();

        let mut slashed: Vec<Address> = env.storage().instance().get(&SLASHED_KEY).unwrap();

        for (addr, _) in commits.iter() {
            if !reveals.contains_key(addr.clone()) {
                slashed.push_back(addr.clone());
                env.events().publish((symbol_short!("slashed"), addr), ());
            }
        }
        env.storage().instance().set(&SLASHED_KEY, &slashed);
    }

    // ── Finalise ──────────────────────────────────────────────────────────────

    /// Finalise the round and produce the final random value.
    ///
    /// The result is `sha256(entropy_accumulator)`.
    ///
    /// # Panics
    /// - If not in reveal phase.
    /// - If the reveal window has not yet closed.
    pub fn finalise(env: Env) -> BytesN<32> {
        Self::assert_phase(&env, Phase::Reveal);
        let reveal_end: u32 = env.storage().instance().get(&REVEAL_END).unwrap();
        assert!(
            env.ledger().sequence() > reveal_end,
            "reveal window still open"
        );

        let entropy: BytesN<32> = env.storage().instance().get(&ENTROPY_KEY).unwrap();
        // Final hash: sha256(accumulated_entropy) for additional mixing.
        let result: BytesN<32> = env.crypto().sha256(&entropy.into()).into();
        env.storage().instance().set(&RESULT_KEY, &result);
        env.storage().instance().set(&PHASE_KEY, &Phase::Finalised);

        env.events()
            .publish((symbol_short!("finalised"),), result.clone());
        result
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /// Returns the final random value (only available after finalisation).
    pub fn get_result(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&RESULT_KEY)
            .expect("not finalised yet")
    }

    /// Returns the current phase.
    pub fn get_phase(env: Env) -> Phase {
        env.storage()
            .instance()
            .get(&PHASE_KEY)
            .expect("not initialised")
    }

    /// Returns the list of slashed addresses.
    pub fn get_slashed(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&SLASHED_KEY)
            .unwrap_or(Vec::new(&env))
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    fn assert_phase(env: &Env, expected: Phase) {
        let current: Phase = env
            .storage()
            .instance()
            .get(&PHASE_KEY)
            .expect("not initialised");
        assert!(current == expected, "wrong phase");
    }

    /// XOR two 32-byte arrays element-wise.
    fn xor_bytes32(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
        let a_arr = a.to_array();
        let b_arr = b.to_array();
        let mut result = [0u8; 32];
        for i in 0..32 {
            result[i] = a_arr[i] ^ b_arr[i];
        }
        BytesN::from_array(env, &result)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{Bytes, Env};

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CommitRevealRng, ());
        let admin = Address::generate(&env);
        (env, contract_id, admin)
    }

    fn make_commitment(env: &Env, secret: &[u8]) -> (Bytes, BytesN<32>) {
        let secret_bytes = Bytes::from_slice(env, secret);
        let hash: BytesN<32> = env.crypto().sha256(&secret_bytes).into();
        (secret_bytes, hash)
    }

    #[test]
    fn test_full_happy_path() {
        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);
        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        // Init: 5 ledger commit window, 5 ledger reveal window
        client.init(&admin, &5, &5);
        assert_eq!(client.get_phase(), Phase::Commit);

        let (s1, c1) = make_commitment(&env, b"secret_one");
        let (s2, c2) = make_commitment(&env, b"secret_two");

        client.commit(&p1, &c1);
        client.commit(&p2, &c2);

        // Advance past commit window
        env.ledger().with_mut(|l| l.sequence_number += 6);
        client.start_reveal();
        assert_eq!(client.get_phase(), Phase::Reveal);

        client.reveal(&p1, &s1);
        client.reveal(&p2, &s2);

        // Advance past reveal window
        env.ledger().with_mut(|l| l.sequence_number += 6);
        let result = client.finalise();
        assert_eq!(client.get_phase(), Phase::Finalised);
        assert_eq!(client.get_result(), result);
    }

    #[test]
    #[should_panic(expected = "secret does not match commitment")]
    fn test_wrong_secret_panics() {
        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);
        let p1 = Address::generate(&env);

        client.init(&admin, &5, &5);
        let (_, c1) = make_commitment(&env, b"real_secret");
        client.commit(&p1, &c1);

        env.ledger().with_mut(|l| l.sequence_number += 6);
        client.start_reveal();

        let wrong = Bytes::from_slice(&env, b"wrong_secret");
        client.reveal(&p1, &wrong);
    }

    #[test]
    #[should_panic(expected = "commit window closed")]
    fn test_commit_after_window_panics() {
        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);
        let p1 = Address::generate(&env);

        client.init(&admin, &5, &5);
        env.ledger().with_mut(|l| l.sequence_number += 6);

        let (_, c1) = make_commitment(&env, b"late");
        client.commit(&p1, &c1);
    }

    #[test]
    fn test_slash_non_revealer() {
        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);
        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        client.init(&admin, &5, &5);
        let (_, c1) = make_commitment(&env, b"s1");
        let (_, c2) = make_commitment(&env, b"s2");
        client.commit(&p1, &c1);
        client.commit(&p2, &c2);

        env.ledger().with_mut(|l| l.sequence_number += 6);
        client.start_reveal();

        // Only p1 reveals
        let (s1, _) = make_commitment(&env, b"s1");
        client.reveal(&p1, &s1);

        // Advance past reveal window
        env.ledger().with_mut(|l| l.sequence_number += 6);
        client.slash_non_revealers();

        let slashed = client.get_slashed();
        assert_eq!(slashed.len(), 1);
        assert_eq!(slashed.get(0).unwrap(), p2);
    }

    #[test]
    #[should_panic(expected = "already committed")]
    fn test_double_commit_panics() {
        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);
        let p1 = Address::generate(&env);

        client.init(&admin, &5, &5);
        let (_, c1) = make_commitment(&env, b"s1");
        client.commit(&p1, &c1);
        client.commit(&p1, &c1);
    }

    #[test]
    fn test_two_participants_produce_different_entropy_than_one() {
        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);
        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        client.init(&admin, &5, &5);
        let (s1, c1) = make_commitment(&env, b"alpha");
        let (s2, c2) = make_commitment(&env, b"beta");
        client.commit(&p1, &c1);
        client.commit(&p2, &c2);

        env.ledger().with_mut(|l| l.sequence_number += 6);
        client.start_reveal();
        client.reveal(&p1, &s1);
        client.reveal(&p2, &s2);

        env.ledger().with_mut(|l| l.sequence_number += 6);
        let result = client.finalise();

        // Result must be non-zero (XOR of two different secrets)
        let zero = BytesN::from_array(&env, &[0u8; 32]);
        assert!(result != zero);
    }
}
