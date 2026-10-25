use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger as _},
    Address, Env,
};

#[contract]
pub struct TestContract;

#[contractimpl]
impl TestContract {
    pub fn initialize(env: Env, admin: Address) {
        crate::initialize(&env, &admin);
    }

    pub fn grant_role(env: Env, caller: Address, role: Role, account: Address) {
        crate::grant_role(&env, &caller, role, &account);
    }

    pub fn revoke_role(env: Env, caller: Address, role: Role, account: Address) {
        crate::revoke_role(&env, &caller, role, &account);
    }

    pub fn has_role(env: Env, account: Address, role: Role) -> bool {
        crate::has_role(&env, &account, role)
    }

    pub fn admin(env: Env) -> Option<Address> {
        crate::admin(&env)
    }

    pub fn propose_admin(env: Env, caller: Address, candidate: Address) -> u64 {
        crate::propose_admin(&env, &caller, &candidate)
    }

    pub fn claim_admin(env: Env, candidate: Address) {
        crate::claim_admin(&env, &candidate);
    }

    pub fn cancel_admin_proposal(env: Env, caller: Address) {
        crate::cancel_admin_proposal(&env, &caller);
    }

    pub fn pending_admin(env: Env) -> Option<AdminProposal> {
        crate::pending_admin(&env)
    }
}

fn setup_test(env: &Env) -> TestContractClient<'_> {
    let contract_id = env.register(TestContract, ());
    TestContractClient::new(env, &contract_id)
}

#[test]
fn initializes_once_and_preserves_admin() {
    let env = Env::default();
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&first);
    client.initialize(&second);
    assert_eq!(client.admin(), Some(first.clone()));
    assert!(client.has_role(&first, &Role::Admin));
    assert!(!client.has_role(&second, &Role::Admin));
}

#[test]
fn admin_can_grant_and_revoke_application_roles() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let instructor = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&admin);
    client.grant_role(&admin, &Role::Instructor, &instructor);
    assert!(client.has_role(&instructor, &Role::Instructor));
    client.revoke_role(&admin, &Role::Instructor, &instructor);
    assert!(!client.has_role(&instructor, &Role::Instructor));
}

#[test]
#[should_panic(expected = "Error(Contract, #307)")]
fn admin_role_cannot_be_granted_directly() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&admin);
    client.grant_role(&admin, &Role::Admin, &candidate);
}

#[test]
#[should_panic(expected = "Error(Contract, #302)")]
fn candidate_cannot_claim_before_48_hours() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&current_admin);
    client.propose_admin(&current_admin, &candidate);
    client.claim_admin(&candidate);
}

#[test]
fn candidate_claims_admin_after_48_hours() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    let instructor = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&current_admin);
    let unlock_at = client.propose_admin(&current_admin, &candidate);
    assert_eq!(client.pending_admin().unwrap().unlock_at, unlock_at);
    assert_eq!(unlock_at, env.ledger().timestamp() + ADMIN_HANDOVER_DELAY);

    env.ledger().with_mut(|ledger| ledger.timestamp = unlock_at);
    client.claim_admin(&candidate);

    assert_eq!(client.admin(), Some(candidate.clone()));
    assert!(client.has_role(&candidate, &Role::Admin));
    assert!(!client.has_role(&current_admin, &Role::Admin));
    assert!(client.pending_admin().is_none());

    client.grant_role(&candidate, &Role::Instructor, &instructor);
    assert!(client.has_role(&instructor, &Role::Instructor));
}

#[test]
#[should_panic(expected = "Error(Contract, #300)")]
fn only_the_proposed_candidate_can_claim_admin() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    let other = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&current_admin);
    let unlock_at = client.propose_admin(&current_admin, &candidate);
    env.ledger().with_mut(|ledger| ledger.timestamp = unlock_at);
    client.claim_admin(&other);
}

#[test]
fn current_admin_can_cancel_a_pending_handover() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&current_admin);
    client.propose_admin(&current_admin, &candidate);
    client.cancel_admin_proposal(&current_admin);
    assert!(client.pending_admin().is_none());
    assert_eq!(client.admin(), Some(current_admin.clone()));
}

#[test]
#[should_panic(expected = "Error(Contract, #300)")]
fn non_admin_cannot_grant_roles() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let instructor = Address::generate(&env);
    env.mock_all_auths();

    let client = setup_test(&env);
    client.initialize(&admin);
    client.grant_role(&attacker, &Role::Instructor, &instructor);
}
