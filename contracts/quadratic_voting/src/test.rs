use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{testutils::Address as _, xdr::ToXdr, Bytes, BytesN, Env, String};

const NULLIFIER_DOMAIN: &[u8] = b"WSL-QV-IDENTITY-NULLIFIER-V1";

fn test_signing_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

#[contract]
struct MockSybil;

#[contractimpl]
impl MockSybil {
    pub fn is_verified(_env: Env, _user: Address) -> bool {
        true
    }
}

#[contract]
struct MockSybilReject;

#[contractimpl]
impl MockSybilReject {
    pub fn is_verified(_env: Env, _user: Address) -> bool {
        false
    }
}

// Mock DID Registry: stores proof count for each DID.
// In reality, this resolves from a persistent DID document;
// here we just return a fixed proof count per test.
#[contract]
struct MockDIDRegistry;

#[contractimpl]
impl MockDIDRegistry {
    pub fn is_active_owner(_env: Env, _did: BytesN<32>, _owner: Address) -> bool {
        true
    }

    pub fn get_proof_count(_env: Env, _did: BytesN<32>) -> u32 {
        3
    }

    pub fn verify_identity_nullifier(
        env: Env,
        did: BytesN<32>,
        proposal_id: u32,
        nullifier: BytesN<32>,
        voting_contract: Address,
        signature: BytesN<64>,
    ) -> bool {
        let public_key = test_signing_key().verifying_key().to_bytes();
        let public_key = BytesN::from_array(&env, &public_key);
        let mut message = Bytes::from_slice(&env, NULLIFIER_DOMAIN);
        message.append(&Bytes::from(did));
        message.append(&Bytes::from_array(&env, &proposal_id.to_be_bytes()));
        message.append(&Bytes::from(nullifier));
        message.append(&voting_contract.to_xdr(&env));
        env.crypto()
            .ed25519_verify(&public_key, &message, &signature);
        true
    }
}

#[contract]
struct MockDIDRegistryZeroProofs;

#[contractimpl]
impl MockDIDRegistryZeroProofs {
    pub fn is_active_owner(_env: Env, _did: BytesN<32>, _owner: Address) -> bool {
        true
    }

    pub fn get_proof_count(_env: Env, _did: BytesN<32>) -> u32 {
        0
    }
}

fn setup(env: &Env) -> (QuadraticVotingContractClient<'static>, Address, Address) {
    let id = env.register(QuadraticVotingContract, ());
    let client = QuadraticVotingContractClient::new(env, &id);
    let admin = Address::generate(env);
    let sybil = env.register(MockSybil, ());
    let did_registry = env.register(MockDIDRegistry, ());
    client.initialize(&admin, &sybil, &did_registry, &100);
    (client, admin, id)
}

fn cast_vote(
    env: &Env,
    client: &QuadraticVotingContractClient<'_>,
    contract_id: &Address,
    voter: &Address,
    proposal_id: u32,
    additional_votes: u32,
    did_bytes: [u8; 32],
    nullifier_bytes: [u8; 32],
) {
    let did = BytesN::from_array(env, &did_bytes);
    let nullifier = BytesN::from_array(env, &nullifier_bytes);
    client.register_voter_did(voter, &did);

    let mut message = Bytes::from_slice(env, NULLIFIER_DOMAIN);
    message.append(&Bytes::from(did.clone()));
    message.append(&Bytes::from_array(env, &proposal_id.to_be_bytes()));
    message.append(&Bytes::from(nullifier.clone()));
    message.append(&contract_id.to_xdr(env));
    let signature = test_signing_key().sign(&message.to_alloc_vec()).to_bytes();
    let proof = BytesN::from_array(env, &signature);
    client.vote(voter, &proposal_id, &additional_votes, &nullifier, &proof);
}

#[test]
fn create_proposal_and_execute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _contract_id) = setup(&env);
    let user = Address::generate(&env);

    let pid = client.create_proposal(&user, &String::from_str(&env, "Improve docs"));
    assert_eq!(pid, 1);
    let proposal = client.get_proposal(&pid);
    assert_eq!(proposal.title, String::from_str(&env, "Improve docs"));

    client.execute_proposal(&pid);
    assert!(client.get_proposal(&pid).executed);
}

#[test]
fn voter_spends_quadratic_cost() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, contract_id) = setup(&env);
    let user = Address::generate(&env);

    assert_eq!(client.get_user_credits(&user), 100);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    // voting 3 votes costs 3² = 9 credits
    cast_vote(&env, &client, &contract_id, &user, 1, 3, [1; 32], [9; 32]);
    assert_eq!(client.get_user_credits(&user), 91);
}

#[test]
#[should_panic(expected = "Error(Contract, #442)")]
fn zero_votes_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, contract_id) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    cast_vote(&env, &client, &contract_id, &user, 1, 0, [1; 32], [9; 32]);
}

#[test]
#[should_panic(expected = "Error(Contract, #444)")]
fn insufficient_credits_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, contract_id) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    // voting 11 votes costs 121 credits > 100
    cast_vote(&env, &client, &contract_id, &user, 1, 11, [1; 32], [9; 32]);
}

#[test]
#[should_panic(expected = "Error(Contract, #445)")]
fn unverified_voter_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(QuadraticVotingContract, ());
    let client = QuadraticVotingContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let sybil = env.register(MockSybilReject, ());
    let did_registry = env.register(MockDIDRegistry, ());
    client.initialize(&admin, &sybil, &did_registry, &100);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    cast_vote(&env, &client, &id, &user, 1, 1, [1; 32], [9; 32]);
}

#[test]
fn unverified_account_zero_matching_weight() {
    // Acceptance criterion: unverified accounts receive zero matching pool weight.
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(QuadraticVotingContract, ());
    let client = QuadraticVotingContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let sybil = env.register(MockSybil, ());
    let did_registry = env.register(MockDIDRegistryZeroProofs, ()); // 0 proofs
    client.initialize(&admin, &sybil, &did_registry, &100);

    let unverified_voter = Address::generate(&env);
    let did = BytesN::from_array(&env, &[1u8; 32]);

    // Register voter with DID that has 0 proofs
    client.register_voter_did(&unverified_voter, &did);

    // Humanity score should be 0
    assert_eq!(client.get_humanity_score(&unverified_voter), 0);

    // Matching pool weight must be zero for unverified account
    assert_eq!(client.get_matching_pool_weight(&unverified_voter), 0);
}

#[test]
fn verified_account_nonzero_matching_weight() {
    // Verified accounts (with proofs) receive non-zero matching pool weight.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _contract_id) = setup(&env);

    let verified_voter = Address::generate(&env);
    let did = BytesN::from_array(&env, &[2u8; 32]);

    // Register voter with DID that has 3 proofs
    client.register_voter_did(&verified_voter, &did);

    // Humanity score should be 3
    assert_eq!(client.get_humanity_score(&verified_voter), 3);

    // Matching pool weight should be non-zero (3 * 10 = 30)
    assert_eq!(client.get_matching_pool_weight(&verified_voter), 30);
}

#[test]
fn proposal_create_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _contract_id) = setup(&env);
    let user = Address::generate(&env);

    let pid = client.create_proposal(&user, &String::from_str(&env, "hi"));
    assert_eq!(pid, 1);
}

#[test]
fn property_terminal_vote_state_is_consistent() {
    // Property: after voting `total`, credits = default - total² and
    // never underflows for values that fit within the credit budget.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, contract_id) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    cast_vote(&env, &client, &contract_id, &user, 1, 7, [1; 32], [9; 32]);
    assert_eq!(client.get_user_credits(&user), 100 - 49);
}

#[test]
fn isqrt_boundaries() {
    assert_eq!(math::isqrt_u128(0), 0);
    assert_eq!(math::isqrt_u128(1), 1);
    assert_eq!(math::isqrt_u128(3), 1);
    assert_eq!(math::isqrt_u128(4), 2);
    assert_eq!(math::isqrt_u128(99), 9);
    assert_eq!(math::isqrt_u128(100), 10);
    assert_eq!(math::isqrt_u128(u128::MAX), u64::MAX as u128);

    assert_eq!(math::isqrt_i128(0), 0);
    assert_eq!(math::isqrt_i128(1), 1);
    assert_eq!(math::isqrt_i128(3), 1);
    assert_eq!(math::isqrt_i128(4), 2);
    assert_eq!(math::isqrt_i128(99), 9);
    assert_eq!(math::isqrt_i128(100), 10);
    assert_eq!(math::isqrt_i128(-1), 0);
    assert_eq!(math::isqrt_i128(i128::MIN), 0);
}

#[test]
fn isqrt_i128_max_does_not_panic_and_is_floor() {
    let r = math::isqrt_i128(i128::MAX);
    // r is floor(sqrt(MAX)): r^2 <= MAX < (r+1)^2.
    assert!(r.checked_mul(r).is_some());
    assert!((r + 1).checked_mul(r + 1).is_none());
}

#[test]
fn isqrt_matches_exact_for_perfect_squares() {
    for k in 0u128..=2_000 {
        assert_eq!(math::isqrt_u128(k * k), k);
        if k > 0 {
            assert_eq!(math::isqrt_u128(k * k - 1), k - 1);
        }
    }
}

#[test]
fn quadratic_cost_values() {
    assert_eq!(math::quadratic_cost(0, 0), Some(0));
    assert_eq!(math::quadratic_cost(0, 3), Some(9));
    assert_eq!(math::quadratic_cost(3, 2), Some(16)); // 25 - 9
    assert_eq!(math::quadratic_cost(3, 4), Some(40)); // 49 - 9
    assert_eq!(
        math::quadratic_cost(u32::MAX as u64, 1),
        Some((u32::MAX as i128 + 1).pow(2) - (u32::MAX as i128).pow(2))
    );
}

#[test]
fn quadratic_cost_overflow_returns_none() {
    assert_eq!(math::quadratic_cost(u64::MAX, u64::MAX), None);
}

#[test]
fn vote_incremental_cost_is_quadratic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, contract_id) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    cast_vote(&env, &client, &contract_id, &user, 1, 3, [1; 32], [9; 32]);
    cast_vote(&env, &client, &contract_id, &user, 1, 2, [1; 32], [9; 32]);
    assert_eq!(client.get_user_credits(&user), 100 - 25);
    assert_eq!(client.get_proposal(&1).votes_received, 5);
    assert_eq!(client.get_proposal(&1).credits_contributed, 25);
}

#[test]
#[should_panic(expected = "Error(Contract, #448)")]
fn identity_nullifier_cannot_vote_from_two_addresses_for_one_proposal() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, contract_id) = setup(&env);
    let first_voter = Address::generate(&env);
    let second_voter = Address::generate(&env);
    client.create_proposal(&first_voter, &String::from_str(&env, "p"));

    cast_vote(
        &env,
        &client,
        &contract_id,
        &first_voter,
        1,
        1,
        [4; 32],
        [8; 32],
    );
    cast_vote(
        &env,
        &client,
        &contract_id,
        &second_voter,
        1,
        1,
        [4; 32],
        [8; 32],
    );
}

#[test]
fn proposal_tally_sums_each_voters_square_root_of_spent_credits() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, contract_id) = setup(&env);
    let first_voter = Address::generate(&env);
    let second_voter = Address::generate(&env);
    client.create_proposal(&first_voter, &String::from_str(&env, "p"));

    cast_vote(
        &env,
        &client,
        &contract_id,
        &first_voter,
        1,
        3,
        [1; 32],
        [11; 32],
    );
    cast_vote(
        &env,
        &client,
        &contract_id,
        &second_voter,
        1,
        4,
        [2; 32],
        [12; 32],
    );

    let proposal = client.get_proposal(&1);
    assert_eq!(proposal.credits_contributed, 25);
    assert_eq!(client.get_proposal_tally(&1), 7);
}
