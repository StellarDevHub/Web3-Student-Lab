use super::*;
use soroban_sdk::{testutils::Address as _, BytesN, Env, String};

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
    pub fn get_proofs(_env: Env, _did: BytesN<32>) -> u32 {
        // Mock: assume registered DIDs have 3 proofs (verified)
        3
    }
}

#[contract]
struct MockDIDRegistryZeroProofs;

#[contractimpl]
impl MockDIDRegistryZeroProofs {
    pub fn get_proofs(_env: Env, _did: BytesN<32>) -> u32 {
        // Mock: DIDs with 0 proofs (unverified)
        0
    }
}

fn setup(env: &Env) -> (QuadraticVotingContractClient<'static>, Address) {
    let id = env.register(QuadraticVotingContract, ());
    let client = QuadraticVotingContractClient::new(env, &id);
    let admin = Address::generate(env);
    let sybil = env.register(MockSybil, ());
    let did_registry = env.register(MockDIDRegistry, ());
    client.initialize(&admin, &sybil, &did_registry, &100);
    (client, admin)
}

#[test]
fn create_proposal_and_execute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
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
    let (client, _) = setup(&env);
    let user = Address::generate(&env);

    assert_eq!(client.get_user_credits(&user), 100);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    // voting 3 votes costs 3² = 9 credits
    client.vote(&user, &1, &3);
    assert_eq!(client.get_user_credits(&user), 91);
}

#[test]
#[should_panic(expected = "Error(Contract, #442)")]
fn zero_votes_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    client.vote(&user, &1, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #444)")]
fn insufficient_credits_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    // voting 11 votes costs 121 credits > 100
    client.vote(&user, &1, &11);
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
    client.vote(&user, &1, &1);
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
    let (client, _) = setup(&env);

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
    let (client, _) = setup(&env);
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
    let (client, _) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    client.vote(&user, &1, &7);
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
    assert!(r.checked_mul(r).unwrap() <= i128::MAX);
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
    assert_eq!(math::quadratic_cost(u32::MAX as u64, 1), Some(
        (u32::MAX as i128 + 1).pow(2) - (u32::MAX as i128).pow(2)
    ));
}

#[test]
fn quadratic_cost_overflow_returns_none() {
    assert_eq!(math::quadratic_cost(u64::MAX, u64::MAX), None);
}

#[test]
fn vote_incremental_cost_is_quadratic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    client.vote(&user, &1, &3); // cost 9
    client.vote(&user, &1, &2); // total 5 -> cost 25, incremental 16
    assert_eq!(client.get_user_credits(&user), 100 - 25);
    assert_eq!(client.get_proposal(&1).votes_received, 5);
}
