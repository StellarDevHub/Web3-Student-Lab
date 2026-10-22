#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env};

fn setup() -> (Env, ProxyContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ProxyContract, ());
    let client = ProxyContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, client, admin)
}

fn dummy_wasm_hash(env: &Env, val: u8) -> BytesN<32> {
    BytesN::from_array(env, &[val; 32])
}

#[test]
fn test_init_and_get_implementation() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);

    client.init(&admin, &wasm);

    assert_eq!(client.get_implementation(), wasm);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_init() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    client.init(&admin, &wasm);
    client.init(&admin, &wasm);
}

#[test]
fn test_upgrade_to_with_timelock() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let eta = client.propose_upgrade(&admin, &wasm2);
    assert_eq!(eta, env.ledger().timestamp() + TIMELOCK_DELAY);

    let res = client.try_upgrade_to(&admin, &wasm2);
    assert!(res.is_err());

    // Advance ledger timestamp past 48 hours (172,800 seconds)
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 1);

    // Call executes upgrade after timelock expiry
    client.upgrade_to(&admin, &wasm2);

    assert_eq!(client.get_implementation(), wasm2);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_upgrade_before_timelock_reverts() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    // Propose upgrade
    client.propose_upgrade(&admin, &wasm2);

    // Executing before timelock expiry must panic with TimelockNotExpired (#8)
    client.execute_upgrade(&admin, &wasm2);
}

#[test]
fn test_propose_approve_and_execute_upgrade() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let eta = client.propose_upgrade(&admin, &wasm2);
    assert_eq!(eta, env.ledger().timestamp() + TIMELOCK_DELAY);

    let proposal = client.get_proposal(&wasm2).unwrap();
    assert_eq!(proposal.wasm_hash, wasm2);
    assert!(!proposal.executed);

    let co_signer = Address::generate(&env);
    client.approve_upgrade(&co_signer, &wasm2);

    env.ledger().set_timestamp(eta + 1);

    client.execute_upgrade(&admin, &wasm2);
    assert_eq!(client.get_implementation(), wasm2);

    let updated_proposal = client.get_proposal(&wasm2).unwrap();
    assert!(updated_proposal.executed);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_unauthorized_upgrade() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);
    let non_admin = Address::generate(&env);

    client.init(&admin, &wasm1);

    client.upgrade_to(&non_admin, &wasm2);
}

#[test]
fn test_storage_version_and_registered_hashes() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    assert_eq!(client.get_storage_version(), 1u32);

    let upgrade_result = client.try_upgrade_to(&admin, &wasm2);
    assert!(upgrade_result.is_err());

    client.register_wasm(&admin, &wasm2);
    client.propose_upgrade(&admin, &wasm2);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 10);
    client.execute_upgrade(&admin, &wasm2);

    assert_eq!(client.get_implementation(), wasm2);
    assert_eq!(client.get_storage_version(), 2u32);
}

#[test]
fn test_two_step_admin_transfer() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    let new_admin = Address::generate(&env);

    client.init(&admin, &wasm);
    client.transfer_admin(&admin, &new_admin);

    assert_eq!(client.get_pending_admin().unwrap(), new_admin);
    assert_eq!(client.get_admin(), admin);

    let wasm2 = dummy_wasm_hash(&env, 2);
    let rejected = client.try_upgrade_to(&new_admin, &wasm2);
    assert!(rejected.is_err());

    client.accept_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin);
    assert!(client.get_pending_admin().is_none());

    client.register_wasm(&new_admin, &wasm2);
    client.propose_upgrade(&new_admin, &wasm2);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 1);
    client.execute_upgrade(&new_admin, &wasm2);
    assert_eq!(client.get_implementation(), wasm2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_transfer_admin_revokes_old_admin() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    let new_admin = Address::generate(&env);

    client.init(&admin, &wasm);
    client.transfer_admin(&admin, &new_admin);
    client.accept_admin(&new_admin);

    let wasm2 = dummy_wasm_hash(&env, 2);
    client.register_wasm(&new_admin, &wasm2);
    client.upgrade_to(&admin, &wasm2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_unauthorized_register_wasm() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);
    let non_admin = Address::generate(&env);

    client.init(&admin, &wasm1);

    client.register_wasm(&non_admin, &wasm2);
}

#[test]
fn test_proxy_state_persists_across_upgrade() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);
    let pending_admin = Address::generate(&env);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    // Build up proxy state before the upgrade.
    client.transfer_admin(&admin, &pending_admin);
    let eta = client.propose_upgrade(&admin, &wasm2);
    let co_signer = Address::generate(&env);
    client.approve_upgrade(&co_signer, &wasm2);
    assert_eq!(client.get_storage_version(), 1u32);

    env.ledger().set_timestamp(eta + 1);
    client.execute_upgrade(&admin, &wasm2);

    // Implementation pointer changed...
    assert_eq!(client.get_implementation(), wasm2);
    assert_eq!(client.get_storage_version(), 2u32);

    // ...but every piece of proxy state survived the upgrade.
    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_pending_admin().unwrap(), pending_admin);
    assert!(client.is_wasm_registered(&wasm1));
    assert!(client.is_wasm_registered(&wasm2));
    let proposal = client.get_proposal(&wasm2).unwrap();
    assert_eq!(proposal.wasm_hash, wasm2);
    assert_eq!(proposal.eta, eta);
    assert!(proposal.executed);

    // The pending-admin ceremony still completes on the upgraded contract.
    client.accept_admin(&pending_admin);
    assert_eq!(client.get_admin(), pending_admin);
    assert!(client.get_pending_admin().is_none());
}

#[test]
fn test_proxy_and_impl_storage_keys_do_not_collide() {
    use soroban_sdk::xdr::ToXdr;
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    client.init(&admin, &wasm);

    // The UUPS implementation intentionally reuses the proxy's Admin /
    // ImplementationWasm keys, so those encodings must match exactly.
    let proxy_admin = ProxyDataKey::Admin.to_xdr(&env);
    let proxy_impl = ProxyDataKey::ImplementationWasm.to_xdr(&env);
    let impl_proxy_admin = implementation_v1::ProxyDataKey::Admin.to_xdr(&env);
    let impl_proxy_wasm = implementation_v1::ProxyDataKey::ImplementationWasm.to_xdr(&env);
    assert_eq!(proxy_admin, impl_proxy_admin);
    assert_eq!(proxy_impl, impl_proxy_wasm);

    // Application-state keys must never alias any proxy key.
    let score_key = implementation_v1::ImplDataKey::Score(admin.clone()).to_xdr(&env);
    assert_ne!(score_key, proxy_admin);
    assert_ne!(score_key, proxy_impl);

    // Behavioral proof: both key families coexist in the same contract storage
    // without clobbering each other.
    env.as_contract(&client.address, || {
        env.storage().instance().set(
            &implementation_v1::ImplDataKey::Score(admin.clone()),
            &77u32,
        );
    });
    assert_eq!(client.get_admin(), admin);
    let score: u32 = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get(&implementation_v1::ImplDataKey::Score(admin.clone()))
            .unwrap()
    });
    assert_eq!(score, 77);
}

// ── SC-046 Security Council Tests ─────────────────────────────────────────────

fn setup_council(
    env: &Env,
    client: &ProxyContractClient<'static>,
    admin: &Address,
) -> Vec<Address> {
    let mut members = Vec::new(env);
    for _ in 0..5 {
        members.push_back(Address::generate(env));
    }
    client.set_security_council(admin, &members);
    members
}

fn dummy_sig(env: &Env, signer: &Address, digest: &BytesN<32>) -> CouncilSignature {
    CouncilSignature {
        signer: signer.clone(),
        digest: digest.clone(),
        signature: BytesN::from_array(env, &[1u8; 64]),
    }
}

#[test]
fn test_security_council_upgrade_happy_path() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let members = setup_council(&env, &client, &admin);

    // Announce upgrade (starts 24-hour timelock)
    let unlock_at = client.announce_upgrade(&admin, &wasm2);
    assert_eq!(unlock_at, env.ledger().timestamp() + ANNOUNCEMENT_TIMELOCK);

    // Prepare 3 valid signatures
    let mut sigs = Vec::new(&env);
    sigs.push_back(dummy_sig(&env, &members.get(0).unwrap(), &wasm2));
    sigs.push_back(dummy_sig(&env, &members.get(1).unwrap(), &wasm2));
    sigs.push_back(dummy_sig(&env, &members.get(2).unwrap(), &wasm2));

    // Fast-forward past 24 hours
    env.ledger().set_timestamp(unlock_at + 1);

    // Execute upgrade with 3 valid signatures
    client.execute_security_council_upgrade(&admin, &wasm2, &sigs);

    assert_eq!(client.get_implementation(), wasm2);
    assert_eq!(client.get_storage_version(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #108)")]
fn test_security_council_rejects_before_24h_timelock() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let members = setup_council(&env, &client, &admin);
    client.announce_upgrade(&admin, &wasm2);

    let mut sigs = Vec::new(&env);
    sigs.push_back(dummy_sig(&env, &members.get(0).unwrap(), &wasm2));
    sigs.push_back(dummy_sig(&env, &members.get(1).unwrap(), &wasm2));
    sigs.push_back(dummy_sig(&env, &members.get(2).unwrap(), &wasm2));

    // Try executing immediately before 24-hour timelock expiry (panics with TimelockNotExpired #108)
    client.execute_security_council_upgrade(&admin, &wasm2, &sigs);
}

#[test]
#[should_panic(expected = "Error(Contract, #105)")]
fn test_security_council_rejects_less_than_3_signatures() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let members = setup_council(&env, &client, &admin);
    let unlock_at = client.announce_upgrade(&admin, &wasm2);
    env.ledger().set_timestamp(unlock_at + 1);

    // Only 2 signatures submitted
    let mut sigs = Vec::new(&env);
    sigs.push_back(dummy_sig(&env, &members.get(0).unwrap(), &wasm2));
    sigs.push_back(dummy_sig(&env, &members.get(1).unwrap(), &wasm2));

    // Panics with ThresholdNotMet #105
    client.execute_security_council_upgrade(&admin, &wasm2, &sigs);
}

#[test]
#[should_panic(expected = "Error(Contract, #106)")]
fn test_security_council_rejects_digest_mismatch() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);
    let wrong_wasm = dummy_wasm_hash(&env, 99);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let members = setup_council(&env, &client, &admin);
    let unlock_at = client.announce_upgrade(&admin, &wasm2);
    env.ledger().set_timestamp(unlock_at + 1);

    // Signatures sign wrong digest
    let mut sigs = Vec::new(&env);
    sigs.push_back(dummy_sig(&env, &members.get(0).unwrap(), &wrong_wasm));
    sigs.push_back(dummy_sig(&env, &members.get(1).unwrap(), &wrong_wasm));
    sigs.push_back(dummy_sig(&env, &members.get(2).unwrap(), &wrong_wasm));

    // Panics with DigestMismatch #106
    client.execute_security_council_upgrade(&admin, &wasm2, &sigs);
}

