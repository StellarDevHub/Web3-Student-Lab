//! # Commit-Reveal RNG Contract
//!
//! A secure, bias-resistant random number generator using a two-phase
//! commit-reveal scheme. Because block hashes are manipulatable by validators,
//! this contract derives entropy from the XOR-hash of all participant secrets.
//!
//! ## Protocol
//! 1. **Commit phase** – each participant submits `H(secret)` (a 32-byte hash).
//! 2. **Reveal phase** – each participant reveals their `secret`; the contract
//!    verifies `H(secret) == commitment` and accumulates entropy.
//! 3. **Finalise** – once reveal window expires, unrevealed commitments are slashed
//!    and the final random value is `H(entropy_accumulator)`.
//!
//! ## Penalties
//! Participants who committed but fail to reveal before the deadline are
//! flagged as **slashed** (in a production system their stake would be seized).
//!
//! ## Security
//! - No block-hash dependency; entropy comes entirely from participant secrets.
//! - Commitments are binding: revealing a different value panics.
//! - Phase transitions are time-locked via ledger sequence numbers with block-delay window enforcement.
//! - Integer overflow: all arithmetic uses `checked_*`.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, Map, Symbol,
    Vec,
};

pub mod ed25519_verify;
pub mod entropy;
pub mod slashing;
pub mod vrf;

pub use ed25519_verify::Ed25519Verifier;
pub use entropy::{accumulate_entropy, finalize_entropy, hash_secret, xor_bytes32};
pub use slashing::{get_deposit, redistribute_slashed_stake, slash_unrevealed};
pub use vrf::{VrfConsumer, VrfError, VrfKey};

// ── Constants ────────────────────────────────────────────────────────────────
const PHASE_KEY: Symbol = symbol_short!("PHASE");
const ENTROPY_KEY: Symbol = symbol_short!("ENTROPY");
const RESULT_KEY: Symbol = symbol_short!("RESULT");
const COMMIT_END: Symbol = symbol_short!("CMTEND");
const REVEAL_END: Symbol = symbol_short!("RVLEND");
const COMMITS_KEY: Symbol = symbol_short!("COMMITS");
const COMMIT_BLOCKS_KEY: Symbol = symbol_short!("CMTBLKS");
const REVEALS_KEY: Symbol = symbol_short!("REVEALS");
const SLASHED_KEY: Symbol = symbol_short!("SLASHED");
const TOKEN_KEY: Symbol = symbol_short!("TOKEN");
const DEPOSITS_KEY: Symbol = symbol_short!("DEPOSITS");

// ── Data types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Phase {
    Commit,
    Reveal,
    Finalised,
}

// ── Sealed-bid auction primitives ────────────────────────────────────────────
//
// These primitives are shared with the fractional NFT vault's commit-reveal
// (Vickrey) auction so both contracts agree on the commitment scheme and the
// anti-snipe deadline math.

/// Anti-snipe window: a bid placed within this many seconds of the deadline
/// triggers an extension (see [`should_extend_deadline`]).
pub const ANTI_SNIPE_WINDOW_SECS: u64 = 5 * 60;

/// Anti-snipe extension: how far a last-minute bid pushes the deadline out.
pub const ANTI_SNIPE_EXTENSION_SECS: u64 = 10 * 60;

/// A sealed bid: the secret `amount` plus the random `nonce` that blinds it.
/// The published commitment is `sha256(amount_be || nonce)` (see
/// [`bid_commitment`]).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bid {
    pub amount: i128,
    pub nonce: BytesN<32>,
}

/// Compute the 32-byte commitment for a sealed [`Bid`].
pub fn bid_commitment(env: &Env, bid: &Bid) -> BytesN<32> {
    let mut raw = [0u8; 48];
    raw[..16].copy_from_slice(&bid.amount.to_be_bytes());
    raw[16..].copy_from_slice(&bid.nonce.to_array());
    env.crypto().sha256(&Bytes::from_slice(env, &raw)).into()
}

/// Returns true when `now` is inside the anti-snipe window before `deadline`.
pub fn should_extend_deadline(now: u64, deadline: u64, window: u64) -> bool {
    now < deadline && deadline.saturating_sub(now) <= window
}

/// Push `deadline` out by `extension` seconds without overflowing.
pub fn extend_deadline(deadline: u64, extension: u64) -> u64 {
    deadline.saturating_add(extension)
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
    /// - `stake_token`: optional address of token required for deposit staking.
    pub fn init(env: Env, admin: Address, commit_duration: u32, reveal_duration: u32) {
        Self::init_with_token(env, admin, commit_duration, reveal_duration, None);
    }

    /// Initialise a new RNG round with optional stake token support.
    pub fn init_with_token(
        env: Env,
        admin: Address,
        commit_duration: u32,
        reveal_duration: u32,
        stake_token: Option<Address>,
    ) {
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
            .set(&COMMIT_BLOCKS_KEY, &Map::<Address, u32>::new(&env));
        env.storage()
            .instance()
            .set(&REVEALS_KEY, &Map::<Address, bool>::new(&env));
        env.storage()
            .instance()
            .set(&SLASHED_KEY, &Vec::<Address>::new(&env));
        env.storage()
            .instance()
            .set(&DEPOSITS_KEY, &Map::<Address, i128>::new(&env));
        if let Some(token) = stake_token {
            env.storage().instance().set(&TOKEN_KEY, &token);
        }
    }

    // ── Commit ────────────────────────────────────────────────────────────────

    /// Submit a commitment `H(secret)` during the commit phase.
    ///
    /// # Panics
    /// - If not in commit phase or commit window has closed.
    /// - If participant has already committed.
    pub fn commit(env: Env, participant: Address, commitment: BytesN<32>) {
        Self::commit_with_deposit(env, participant, commitment, 0);
    }

    /// Submit a commitment with an attached stake deposit.
    pub fn commit_with_deposit(
        env: Env,
        participant: Address,
        commitment: BytesN<32>,
        deposit_amount: i128,
    ) {
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

        if deposit_amount > 0 {
            let token_addr: Address = env
                .storage()
                .instance()
                .get(&TOKEN_KEY)
                .expect("stake token not configured");
            let token_client = soroban_sdk::token::Client::new(&env, &token_addr);
            token_client.transfer(&participant, &env.current_contract_address(), &deposit_amount);

            let mut deposits: Map<Address, i128> =
                env.storage().instance().get(&DEPOSITS_KEY).unwrap();
            deposits.set(participant.clone(), deposit_amount);
            env.storage().instance().set(&DEPOSITS_KEY, &deposits);
        }

        commits.set(participant.clone(), commitment);
        env.storage().instance().set(&COMMITS_KEY, &commits);

        let mut commit_blocks: Map<Address, u32> =
            env.storage().instance().get(&COMMIT_BLOCKS_KEY).unwrap();
        commit_blocks.set(participant.clone(), env.ledger().sequence());
        env.storage()
            .instance()
            .set(&COMMIT_BLOCKS_KEY, &commit_blocks);

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
    /// - If reveal attempted in the same block as commitment (block delay violation).
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

        let commit_blocks: Map<Address, u32> =
            env.storage().instance().get(&COMMIT_BLOCKS_KEY).unwrap();
        if let Some(commit_blk) = commit_blocks.get(participant.clone()) {
            assert!(
                env.ledger().sequence() > commit_blk,
                "block delay requirement not met"
            );
        }

        // Verify commitment: sha256(secret) must equal the stored hash.
        let hash = entropy::hash_secret(&env, &secret);
        assert!(hash == commitment, "secret does not match commitment");

        let mut reveals: Map<Address, bool> = env.storage().instance().get(&REVEALS_KEY).unwrap();
        assert!(
            !reveals.contains_key(participant.clone()),
            "already revealed"
        );
        reveals.set(participant.clone(), true);
        env.storage().instance().set(&REVEALS_KEY, &reveals);

        // Refund participant's deposit upon honest reveal if deposit was made
        let mut deposits: Map<Address, i128> = env.storage().instance().get(&DEPOSITS_KEY).unwrap();
        if let Some(deposit) = deposits.get(participant.clone()) {
            if deposit > 0 {
                let token_addr: Address = env.storage().instance().get(&TOKEN_KEY).unwrap();
                let token_client = soroban_sdk::token::Client::new(&env, &token_addr);
                token_client.transfer(&env.current_contract_address(), &participant, &deposit);
                deposits.set(participant.clone(), 0);
                env.storage().instance().set(&DEPOSITS_KEY, &deposits);
            }
        }

        // XOR the new secret hash into the running entropy accumulator.
        let current_entropy: BytesN<32> = env.storage().instance().get(&ENTROPY_KEY).unwrap();
        let new_entropy = entropy::accumulate_entropy(&env, &current_entropy, &hash);
        env.storage().instance().set(&ENTROPY_KEY, &new_entropy);

        env.events()
            .publish((symbol_short!("revealed"), participant), ());
    }

    // ── Slash non-revealers ───────────────────────────────────────────────────

    /// After the reveal window closes, slash participants who committed but
    /// did not reveal. Confiscates stakes and optionally redistributes to honest revealers.
    pub fn slash_non_revealers(env: Env) -> i128 {
        Self::assert_phase(&env, Phase::Reveal);
        let reveal_end: u32 = env.storage().instance().get(&REVEAL_END).unwrap();
        assert!(
            env.ledger().sequence() > reveal_end,
            "reveal window still open"
        );

        let commits: Map<Address, BytesN<32>> = env.storage().instance().get(&COMMITS_KEY).unwrap();
        let reveals: Map<Address, bool> = env.storage().instance().get(&REVEALS_KEY).unwrap();
        let mut slashed: Vec<Address> = env.storage().instance().get(&SLASHED_KEY).unwrap();
        let mut deposits: Map<Address, i128> = env.storage().instance().get(&DEPOSITS_KEY).unwrap();

        let total_confiscated = slashing::slash_unrevealed(
            &env,
            &commits,
            &reveals,
            &mut slashed,
            &mut deposits,
        );

        for addr in slashed.iter() {
            env.events().publish((symbol_short!("slashed"), addr), ());
        }

        env.storage().instance().set(&SLASHED_KEY, &slashed);
        env.storage().instance().set(&DEPOSITS_KEY, &deposits);

        // If stake token is set and stakes were confiscated, redistribute among revealers
        if total_confiscated > 0 {
            if let Some(token_addr) = env.storage().instance().get(&TOKEN_KEY) {
                slashing::redistribute_slashed_stake(
                    &env,
                    &token_addr,
                    &reveals,
                    total_confiscated,
                );
            }
        }

        total_confiscated
    }

    // ── Finalise ──────────────────────────────────────────────────────────────

    /// Finalise the round and produce the final random value.
    ///
    /// Automatically slashes unrevealed commitments upon expiry and computes `sha256(entropy_accumulator)`.
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

        Self::slash_non_revealers(env.clone());

        let entropy: BytesN<32> = env.storage().instance().get(&ENTROPY_KEY).unwrap();
        // Final hash: sha256(accumulated_entropy) for uniform unbiased randomness.
        let result = entropy::finalize_entropy(&env, &entropy);
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

    /// Returns the deposited stake amount for an address.
    pub fn get_deposit(env: Env, participant: Address) -> i128 {
        let deposits: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&DEPOSITS_KEY)
            .unwrap_or(Map::new(&env));
        slashing::get_deposit(&env, &deposits, &participant)
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
    pub fn xor_bytes32(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
        entropy::xor_bytes32(env, a, b)
    }

    // ── VRF Consumer (SC-045) ────────────────────────────────────────────────

    /// Initialize the authorized VRF oracle public key.
    pub fn init_vrf_oracle(env: Env, admin: Address, oracle_pubkey: BytesN<32>) {
        VrfConsumer::init_oracle(&env, admin, oracle_pubkey);
    }

    /// Update the authorized VRF oracle public key. Admin-only.
    pub fn update_vrf_oracle(env: Env, admin: Address, new_oracle_pubkey: BytesN<32>) {
        VrfConsumer::update_oracle(&env, admin, new_oracle_pubkey);
    }

    /// Get the registered VRF oracle public key.
    pub fn get_vrf_oracle(env: Env) -> BytesN<32> {
        VrfConsumer::get_oracle(&env)
    }

    /// Verify VRF proof against seed and oracle public key without state mutation.
    pub fn verify_vrf_proof(
        env: Env,
        oracle_pubkey: BytesN<32>,
        seed: BytesN<32>,
        proof: BytesN<64>,
    ) -> BytesN<32> {
        VrfConsumer::verify_vrf_proof(&env, &oracle_pubkey, &seed, &proof)
    }

    /// Verify VRF proof against registered oracle and consume seed to prevent replay.
    pub fn consume_vrf(env: Env, seed: BytesN<32>, proof: BytesN<64>) -> BytesN<32> {
        VrfConsumer::verify_and_consume_vrf(&env, seed, proof)
    }

    /// Generate an unbiased, provably fair pseudorandom integer in [min, max] using VRF.
    pub fn generate_vrf_random_int(
        env: Env,
        seed: BytesN<32>,
        proof: BytesN<64>,
        min: u64,
        max: u64,
    ) -> u64 {
        VrfConsumer::generate_fair_random_int(&env, seed, proof, min, max)
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

    #[test]
    fn test_vrf_happy_path_and_random_int() {
        use ed25519_dalek::Signer;

        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);

        let secret_bytes: [u8; 32] = [42u8; 32];
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_bytes);
        let verifying_key = signing_key.verifying_key();
        let oracle_pubkey = BytesN::from_array(&env, verifying_key.as_bytes());

        client.init_vrf_oracle(&admin, &oracle_pubkey);
        assert_eq!(client.get_vrf_oracle(), oracle_pubkey);

        let seed = BytesN::from_array(&env, &[7u8; 32]);
        let signature = signing_key.sign(&seed.to_array());
        let proof = BytesN::from_array(&env, &signature.to_bytes());

        // Stateless verification
        let output1 = client.verify_vrf_proof(&oracle_pubkey, &seed, &proof);
        assert_ne!(output1, BytesN::from_array(&env, &[0u8; 32]));

        // Consume and prevent replay
        let output2 = client.consume_vrf(&seed, &proof);
        assert_eq!(output1, output2);

        // Test unbiased bounded integer in range [10, 50]
        let rand_int = VrfConsumer::bounded_pseudorandom_int(&output2, 10, 50);
        assert!(rand_int >= 10 && rand_int <= 50);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #504)")]
    fn test_vrf_rejects_replay_seed() {
        use ed25519_dalek::Signer;

        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);

        let secret_bytes: [u8; 32] = [55u8; 32];
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_bytes);
        let oracle_pubkey = BytesN::from_array(&env, signing_key.verifying_key().as_bytes());

        client.init_vrf_oracle(&admin, &oracle_pubkey);

        let seed = BytesN::from_array(&env, &[99u8; 32]);
        let signature = signing_key.sign(&seed.to_array());
        let proof = BytesN::from_array(&env, &signature.to_bytes());

        // First consume succeeds
        client.consume_vrf(&seed, &proof);
        // Second consume with identical seed must fail with SeedAlreadyConsumed (#504)
        client.consume_vrf(&seed, &proof);
    }

    #[test]
    #[should_panic]
    fn test_vrf_rejects_tampered_proof() {
        use ed25519_dalek::Signer;

        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);

        let secret_bytes: [u8; 32] = [88u8; 32];
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_bytes);
        let oracle_pubkey = BytesN::from_array(&env, signing_key.verifying_key().as_bytes());

        client.init_vrf_oracle(&admin, &oracle_pubkey);

        let seed = BytesN::from_array(&env, &[12u8; 32]);
        let signature = signing_key.sign(&seed.to_array());
        let mut tampered_sig = signature.to_bytes();
        tampered_sig[0] ^= 0xFF; // Corrupt signature byte
        let tampered_proof = BytesN::from_array(&env, &tampered_sig);

        // Verification must panic on tampered signature
        client.consume_vrf(&seed, &tampered_proof);
    }

    #[test]
    fn test_vrf_generate_fair_random_int() {
        use ed25519_dalek::Signer;

        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);

        let secret_bytes: [u8; 32] = [33u8; 32];
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_bytes);
        let oracle_pubkey = BytesN::from_array(&env, signing_key.verifying_key().as_bytes());

        client.init_vrf_oracle(&admin, &oracle_pubkey);

        let seed = BytesN::from_array(&env, &[77u8; 32]);
        let signature = signing_key.sign(&seed.to_array());
        let proof = BytesN::from_array(&env, &signature.to_bytes());

        let num = client.generate_vrf_random_int(&seed, &proof, &1, &100);
        assert!(num >= 1 && num <= 100);
    }

    #[test]
    fn test_stake_deposit_slashing_and_redistribution() {
        let (env, contract_id, admin) = setup();
        let client = CommitRevealRngClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_client = soroban_sdk::token::Client::new(&env, &token_contract.address());
        let token_admin_client =
            soroban_sdk::token::StellarAssetClient::new(&env, &token_contract.address());

        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);
        let p3 = Address::generate(&env);

        let stake_amount: i128 = 1_000;
        token_admin_client.mint(&p1, &stake_amount);
        token_admin_client.mint(&p2, &stake_amount);
        token_admin_client.mint(&p3, &stake_amount);

        // Init with stake token
        client.init_with_token(&admin, &5, &5, &Some(token_contract.address()));

        let (s1, c1) = make_commitment(&env, b"honest_participant_1");
        let (_s2, c2) = make_commitment(&env, b"dishonest_participant_2");
        let (s3, c3) = make_commitment(&env, b"honest_participant_3");

        client.commit_with_deposit(&p1, &c1, &stake_amount);
        client.commit_with_deposit(&p2, &c2, &stake_amount);
        client.commit_with_deposit(&p3, &c3, &stake_amount);

        assert_eq!(client.get_deposit(&p1), stake_amount);
        assert_eq!(client.get_deposit(&p2), stake_amount);
        assert_eq!(client.get_deposit(&p3), stake_amount);
        assert_eq!(token_client.balance(&contract_id), 3_000);

        // Move to reveal phase
        env.ledger().with_mut(|l| l.sequence_number += 6);
        client.start_reveal();

        // p1 and p3 reveal honestly; p2 refuses to reveal (withholds salt)
        client.reveal(&p1, &s1);
        client.reveal(&p3, &s3);

        // p1 and p3 got their deposits refunded upon honest reveal
        assert_eq!(token_client.balance(&p1), stake_amount);
        assert_eq!(token_client.balance(&p3), stake_amount);
        assert_eq!(client.get_deposit(&p1), 0);
        assert_eq!(client.get_deposit(&p3), 0);

        // Move past reveal window
        env.ledger().with_mut(|l| l.sequence_number += 6);
        let res = client.finalise();
        assert_ne!(res, BytesN::from_array(&env, &[0u8; 32]));

        // p2 must be slashed
        let slashed = client.get_slashed();
        assert_eq!(slashed.len(), 1);
        assert_eq!(slashed.get(0).unwrap(), p2);
        assert_eq!(client.get_deposit(&p2), 0);

        // p2's slashed 1000 stake was redistributed equally among 2 honest revealers (500 each)
        assert_eq!(token_client.balance(&p1), 1_500);
        assert_eq!(token_client.balance(&p3), 1_500);
        assert_eq!(token_client.balance(&p2), 0);
    }
}
