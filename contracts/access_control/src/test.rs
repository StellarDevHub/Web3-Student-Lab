use super::*;
use crate::circuit_breaker::UNPAUSE_TIMELOCK_SECONDS;
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

    // ── Circuit breaker surface ───────────────────────────────────────────

    pub fn set_breaker_guardian(env: Env, caller: Address, guardian: Address) {
        crate::circuit_breaker::set_guardian(&env, &caller, &guardian);
    }

    pub fn pause(env: Env, caller: Address) {
        crate::circuit_breaker::pause(&env, &caller);
    }

    pub fn propose_unpause(env: Env, caller: Address) -> u64 {
        crate::circuit_breaker::propose_unpause(&env, &caller)
    }

    pub fn unpause(env: Env, caller: Address) {
        crate::circuit_breaker::unpause(&env, &caller);
    }

    pub fn cancel_unpause(env: Env, caller: Address) {
        crate::circuit_breaker::cancel_unpause(&env, &caller);
    }

    pub fn unpause_unlock_at(env: Env) -> Option<u64> {
        crate::circuit_breaker::unpause_unlock_at(&env)
    }

    pub fn is_paused(env: Env) -> bool {
        crate::circuit_breaker::is_paused(&env)
    }

    /// Example gated entrypoint: must revert while paused.
    pub fn guarded_action(env: Env) -> bool {
        crate::require_not_paused!(&env);
        true
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

// ── Circuit breaker ──────────────────────────────────────────────────────────

#[test]
fn guardian_pauses_instantly_but_cannot_unpause() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);

    let client = setup_test(&env);
    client.initialize(&admin);
    client.set_breaker_guardian(&admin, &guardian);
    client.pause(&guardian);

    assert!(client.is_paused());
    assert!(client.try_guarded_action().is_err());
    assert!(client.try_unpause(&guardian).is_err());
    assert!(client.try_unpause(&admin).is_err()); // no proposal yet
    assert!(client.try_guarded_action().is_err());
}

#[test]
fn admin_unpauses_only_after_the_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);

    let client = setup_test(&env);
    client.initialize(&admin);
    client.set_breaker_guardian(&admin, &guardian);
    client.pause(&guardian);

    let unlock_at = client.propose_unpause(&admin);
    assert_eq!(
        unlock_at,
        env.ledger().timestamp() + UNPAUSE_TIMELOCK_SECONDS
    );
    assert_eq!(client.unpause_unlock_at(), Some(unlock_at));
    assert!(client.try_unpause(&admin).is_err()); // too early

    env.ledger().with_mut(|ledger| ledger.timestamp = unlock_at);
    client.unpause(&admin);

    assert!(!client.is_paused());
    assert!(client.unpause_unlock_at().is_none());
    assert!(client.guarded_action());
}

#[test]
fn re_pausing_restarts_the_unpause_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);

    let client = setup_test(&env);
    client.initialize(&admin);
    client.set_breaker_guardian(&admin, &guardian);
    client.pause(&guardian);
    let first_unlock = client.propose_unpause(&admin);

    env.ledger()
        .with_mut(|ledger| ledger.timestamp = first_unlock / 2);
    // A second pause (e.g. attack still in progress) must invalidate the
    // pending unpause instead of letting it fire on the original schedule.
    client.pause(&guardian);
    assert!(client.unpause_unlock_at().is_none());
    assert!(client.try_unpause(&admin).is_err());
}

#[test]
#[should_panic(expected = "Error(Contract, #300)")]
fn non_guardian_cannot_pause() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let stranger = Address::generate(&env);

    let client = setup_test(&env);
    client.initialize(&admin);
    client.pause(&stranger);
}

#[test]
#[should_panic(expected = "Error(Contract, #310)")]
fn cannot_propose_unpause_while_running() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let client = setup_test(&env);
    client.initialize(&admin);
    client.propose_unpause(&admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #300)")]
fn only_admin_can_rotate_the_guardian() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);
    let attacker = Address::generate(&env);

    let client = setup_test(&env);
    client.initialize(&admin);
    client.set_breaker_guardian(&attacker, &guardian);
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
