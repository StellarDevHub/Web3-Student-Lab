use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn in_contract<T>(env: &Env, f: impl FnOnce() -> T) -> T {
    let contract_id = Address::generate(env);
    env.as_contract(&contract_id, f)
}

#[test]
fn initializes_once_and_preserves_admin() {
    let env = Env::default();
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    env.mock_all_auths();

    in_contract(&env, || {
        initialize(&env, &first);
        initialize(&env, &second);
        assert_eq!(admin(&env), Some(first.clone()));
        assert!(has_role(&env, &first, Role::Admin));
        assert!(!has_role(&env, &second, Role::Admin));
    });
}

#[test]
fn admin_can_grant_and_revoke_application_roles() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let instructor = Address::generate(&env);
    env.mock_all_auths();

    in_contract(&env, || {
        initialize(&env, &admin);
        grant_role(&env, &admin, Role::Instructor, &instructor);
        assert!(has_role(&env, &instructor, Role::Instructor));
        revoke_role(&env, &admin, Role::Instructor, &instructor);
        assert!(!has_role(&env, &instructor, Role::Instructor));
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #307)")]
fn admin_role_cannot_be_granted_directly() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    env.mock_all_auths();

    in_contract(&env, || {
        initialize(&env, &admin);
        grant_role(&env, &admin, Role::Admin, &candidate);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #302)")]
fn candidate_cannot_claim_before_48_hours() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    env.mock_all_auths();

    in_contract(&env, || {
        initialize(&env, &current_admin);
        propose_admin(&env, &current_admin, &candidate);
        claim_admin(&env, &candidate);
    });
}

#[test]
fn candidate_claims_admin_after_48_hours() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    let instructor = Address::generate(&env);
    let contract_id = Address::generate(&env);
    env.mock_all_auths();

    let unlock_at = env.as_contract(&contract_id, || {
        initialize(&env, &current_admin);
        let unlock_at = propose_admin(&env, &current_admin, &candidate);
        assert_eq!(pending_admin(&env).unwrap().unlock_at, unlock_at);
        assert_eq!(unlock_at, env.ledger().timestamp() + ADMIN_HANDOVER_DELAY);
        unlock_at
    });

    env.ledger().with_mut(|ledger| ledger.timestamp = unlock_at);
    env.as_contract(&contract_id, || {
        claim_admin(&env, &candidate);

        assert_eq!(admin(&env), Some(candidate.clone()));
        assert!(has_role(&env, &candidate, Role::Admin));
        assert!(!has_role(&env, &current_admin, Role::Admin));
        assert!(pending_admin(&env).is_none());

        grant_role(&env, &candidate, Role::Instructor, &instructor);
        assert!(has_role(&env, &instructor, Role::Instructor));
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #300)")]
fn only_the_proposed_candidate_can_claim_admin() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    let other = Address::generate(&env);
    let contract_id = Address::generate(&env);
    env.mock_all_auths();

    let unlock_at = env.as_contract(&contract_id, || {
        initialize(&env, &current_admin);
        propose_admin(&env, &current_admin, &candidate)
    });
    env.ledger().with_mut(|ledger| ledger.timestamp = unlock_at);
    env.as_contract(&contract_id, || {
        claim_admin(&env, &other);
    });
}

#[test]
fn current_admin_can_cancel_a_pending_handover() {
    let env = Env::default();
    let current_admin = Address::generate(&env);
    let candidate = Address::generate(&env);
    env.mock_all_auths();

    in_contract(&env, || {
        initialize(&env, &current_admin);
        propose_admin(&env, &current_admin, &candidate);
        cancel_admin_proposal(&env, &current_admin);
        assert!(pending_admin(&env).is_none());
        assert_eq!(admin(&env), Some(current_admin.clone()));
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #300)")]
fn non_admin_cannot_grant_roles() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let instructor = Address::generate(&env);
    env.mock_all_auths();

    in_contract(&env, || {
        initialize(&env, &admin);
        grant_role(&env, &attacker, Role::Instructor, &instructor);
    });
}
