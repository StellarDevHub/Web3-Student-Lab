#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, vec, Address, BytesN, Env};

fn setup() -> (
    Env,
    Address,                            // admin
    token::Client<'static>,             // payment token client
    token::StellarAssetClient<'static>, // token admin client
    Address,                            // contract address
    FreelancePlatformClient<'static>,   // freelance board contract client
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    // Register standard token contract
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_contract.address());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_contract.address());

    let contract_id = env.register(FreelancePlatform, ());
    let client = FreelancePlatformClient::new(&env, &contract_id);

    client.initialize(&admin, &token_contract.address());

    (
        env,
        admin,
        token_client,
        token_admin_client,
        contract_id,
        client,
    )
}

#[test]
fn test_worker_registration() {
    let (env, _, _, _, _, client) = setup();
    let worker = Address::generate(&env);

    assert!(!client.is_worker_registered(&worker));
    client.register_worker(&worker);
    assert!(client.is_worker_registered(&worker));
}

#[test]
fn test_create_job_and_escrow_deposit() {
    let (env, _, token_client, token_admin, contract_addr, client) = setup();

    let employer = Address::generate(&env);
    let freelancer = Address::generate(&env);

    // Mint 1000 tokens to employer
    token_admin.mint(&employer, &1000);
    assert_eq!(token_client.balance(&employer), 1000);

    let milestone_descs = vec![
        &env,
        Symbol::new(&env, "milestone1"),
        Symbol::new(&env, "milestone2"),
    ];
    let milestone_amts = vec![&env, 400i128, 600i128];

    let job_id = client.create_job(
        &employer,
        &freelancer,
        &1000,
        &milestone_descs,
        &milestone_amts,
    );

    assert_eq!(job_id, 1);

    // Check employer balance was transferred to contract escrow
    assert_eq!(token_client.balance(&employer), 0);
    assert_eq!(token_client.balance(&contract_addr), 1000);

    let job = client.get_job(&job_id).unwrap();
    assert_eq!(job.client, employer);
    assert_eq!(job.freelancer, freelancer);
    assert_eq!(job.budget, 1000);
    assert_eq!(job.status, Symbol::new(&env, "active"));
}

#[test]
fn test_milestone_approval_and_payout() {
    let (env, _, token_client, token_admin, contract_addr, client) = setup();

    let employer = Address::generate(&env);
    let freelancer = Address::generate(&env);
    client.register_worker(&freelancer);

    token_admin.mint(&employer, &1000);

    let milestone_descs = vec![&env, Symbol::new(&env, "m1")];
    let milestone_amts = vec![&env, 1000i128];

    let job_id = client.create_job(
        &employer,
        &freelancer,
        &1000,
        &milestone_descs,
        &milestone_amts,
    );

    // Worker submits milestone
    client.submit_milestone(&job_id, &0);

    // Employer approves milestone
    client.approve_milestone(&job_id, &0);

    // Escrow should payout 1000 to freelancer
    assert_eq!(token_client.balance(&contract_addr), 0);
    assert_eq!(token_client.balance(&freelancer), 1000);

    let job = client.get_job(&job_id).unwrap();
    assert_eq!(job.status, symbol_short!("complete"));
}

#[test]
fn test_dispute_resolution_refund() {
    let (env, _admin, token_client, token_admin, contract_addr, client) = setup();

    let employer = Address::generate(&env);
    let freelancer = Address::generate(&env);
    client.register_worker(&freelancer);

    token_admin.mint(&employer, &1000);

    let milestone_descs = vec![&env, Symbol::new(&env, "m1")];
    let milestone_amts = vec![&env, 1000i128];

    let job_id = client.create_job(
        &employer,
        &freelancer,
        &1000,
        &milestone_descs,
        &milestone_amts,
    );

    // Dispute milestone
    client.dispute_milestone(&job_id, &0, &employer);

    let job_before = client.get_job(&job_id).unwrap();
    assert_eq!(job_before.status, symbol_short!("disputed"));

    // Admin resolves dispute: refund to client (release_to_freelancer = false)
    client.resolve_dispute(&job_id, &0, &false);

    assert_eq!(token_client.balance(&contract_addr), 0);
    assert_eq!(token_client.balance(&employer), 1000);
    assert_eq!(token_client.balance(&freelancer), 0);

    let job_after = client.get_job(&job_id).unwrap();
    assert_eq!(job_after.status, symbol_short!("active"));
}

#[test]
fn test_dispute_resolution_payout() {
    let (env, _admin, token_client, token_admin, contract_addr, client) = setup();

    let employer = Address::generate(&env);
    let freelancer = Address::generate(&env);
    client.register_worker(&freelancer);

    token_admin.mint(&employer, &1000);

    let milestone_descs = vec![&env, Symbol::new(&env, "m1")];
    let milestone_amts = vec![&env, 1000i128];

    let job_id = client.create_job(
        &employer,
        &freelancer,
        &1000,
        &milestone_descs,
        &milestone_amts,
    );

    // Dispute milestone
    client.dispute_milestone(&job_id, &0, &freelancer);

    // Admin resolves dispute: release to freelancer (release_to_freelancer = true)
    client.resolve_dispute(&job_id, &0, &true);

    assert_eq!(token_client.balance(&contract_addr), 0);
    assert_eq!(token_client.balance(&employer), 0);
    assert_eq!(token_client.balance(&freelancer), 1000);
}

#[test]
fn test_deliverable_submission_and_auto_release_after_14_days() {
    let (env, _, token_client, token_admin, contract_addr, client) = setup();

    let employer = Address::generate(&env);
    let freelancer = Address::generate(&env);
    client.register_worker(&freelancer);

    token_admin.mint(&employer, &1000);

    let milestone_descs = vec![&env, Symbol::new(&env, "m1")];
    let milestone_amts = vec![&env, 1000i128];

    let job_id = client.create_job(
        &employer,
        &freelancer,
        &1000,
        &milestone_descs,
        &milestone_amts,
    );

    // Initial timestamp: 10,000
    env.ledger().set_timestamp(10_000);

    let hash_bytes = [7u8; 32];
    let deliverable_hash = BytesN::from_array(&env, &hash_bytes);

    // Worker submits with deliverable hash
    client.submit_milestone_deliverable(&job_id, &0, &deliverable_hash);

    let deliv = client.get_deliverable(&job_id, &0).unwrap();
    assert_eq!(deliv.deliverable_hash, deliverable_hash);
    assert_eq!(deliv.submitted_at, 10_000);
    assert_eq!(deliv.auto_release_at, 10_000 + 1_209_600);
    assert!(!deliv.is_released);

    // Try auto-release before 14 days have passed -> should fail
    env.ledger().set_timestamp(10_000 + 1_209_599);
    let res = client.try_auto_release_milestone(&job_id, &0);
    assert!(res.is_err());

    // Advance to or past 14 days (1_209_600 seconds)
    env.ledger().set_timestamp(10_000 + 1_209_600);
    client.auto_release_milestone(&job_id, &0);

    assert_eq!(token_client.balance(&contract_addr), 0);
    assert_eq!(token_client.balance(&freelancer), 1000);

    let job = client.get_job(&job_id).unwrap();
    assert_eq!(job.status, symbol_short!("complete"));

    let deliv_after = client.get_deliverable(&job_id, &0).unwrap();
    assert!(deliv_after.is_released);
}

#[test]
fn test_arbiter_registration_and_binding_multisig_arbitration() {
    let (env, _admin, token_client, token_admin, contract_addr, client) = setup();

    let employer = Address::generate(&env);
    let freelancer = Address::generate(&env);
    client.register_worker(&freelancer);

    let arbiter1 = Address::generate(&env);
    let arbiter2 = Address::generate(&env);
    let random_user = Address::generate(&env);

    // Register student arbiters
    client.register_arbiter(&arbiter1);
    client.register_arbiter(&arbiter2);

    assert!(client.is_arbiter(&arbiter1));
    assert!(client.is_arbiter(&arbiter2));
    assert!(!client.is_arbiter(&random_user));

    token_admin.mint(&employer, &1000);

    let milestone_descs = vec![&env, Symbol::new(&env, "m1")];
    let milestone_amts = vec![&env, 1000i128];

    let job_id = client.create_job(
        &employer,
        &freelancer,
        &1000,
        &milestone_descs,
        &milestone_amts,
    );

    // Dispute milestone
    client.dispute_milestone(&job_id, &0, &employer);

    // Random non-arbiter tries to vote -> error
    let res_err = client.try_cast_arbitration_vote(&job_id, &0, &random_user, &true);
    assert!(res_err.is_err());

    // First arbiter votes for freelancer (quorum is 2, not reached yet)
    client.cast_arbitration_vote(&job_id, &0, &arbiter1, &true);

    let dispute_info = client.get_dispute(&job_id, &0).unwrap();
    assert_eq!(dispute_info.votes_for_freelancer, 1);
    assert_eq!(dispute_info.votes_for_client, 0);
    assert!(!dispute_info.is_resolved);
    assert_eq!(token_client.balance(&contract_addr), 1000);

    // Second arbiter votes for freelancer -> reaching quorum!
    client.cast_arbitration_vote(&job_id, &0, &arbiter2, &true);

    let dispute_resolved = client.get_dispute(&job_id, &0).unwrap();
    assert_eq!(dispute_resolved.votes_for_freelancer, 2);
    assert!(dispute_resolved.is_resolved);
    assert_eq!(dispute_resolved.winning_party, Some(freelancer.clone()));

    // Escrow payout executed immediately to freelancer
    assert_eq!(token_client.balance(&contract_addr), 0);
    assert_eq!(token_client.balance(&freelancer), 1000);
    assert_eq!(token_client.balance(&employer), 0);
}

#[test]
fn test_bounty_creation_and_single_claim_payout() {
    let (env, _, token_client, token_admin, contract_addr, client) = setup();

    let funder = Address::generate(&env);
    let contributor = Address::generate(&env);

    token_admin.mint(&funder, &2000);
    assert_eq!(token_client.balance(&funder), 2000);

    let expiration = env.ledger().timestamp() + 1000;
    let bounty_id = client.create_bounty(
        &funder,
        &Symbol::new(&env, "Fix_Issue_123"),
        &1500,
        &expiration,
    );
    assert_eq!(bounty_id, 1);
    assert_eq!(token_client.balance(&contract_addr), 1500);
    assert_eq!(token_client.balance(&funder), 500);

    let bounty = client.get_bounty(&bounty_id).unwrap();
    assert_eq!(bounty.amount, 1500);
    assert_eq!(bounty.status, bounty::BountyStatus::Open);

    // Contributor submits pull request proof hash
    let evidence_hash = BytesN::from_array(&env, &[7u8; 32]);
    client.claim_bounty(&contributor, &bounty_id, &evidence_hash);

    let bounty = client.get_bounty(&bounty_id).unwrap();
    assert_eq!(bounty.status, bounty::BountyStatus::Claimed);
    assert_eq!(bounty.evidence_hash, Some(evidence_hash));

    // Funder verifies PR and approves payout
    client.verify_and_payout(&funder, &bounty_id);

    let bounty = client.get_bounty(&bounty_id).unwrap();
    assert_eq!(bounty.status, bounty::BountyStatus::Completed);
    assert_eq!(token_client.balance(&contributor), 1500);
    assert_eq!(token_client.balance(&contract_addr), 0);
}

#[test]
fn test_bounty_collaborative_split_payout() {
    let (env, _, token_client, token_admin, contract_addr, client) = setup();

    let funder = Address::generate(&env);
    let dev1 = Address::generate(&env);
    let dev2 = Address::generate(&env);
    let dev3 = Address::generate(&env);

    token_admin.mint(&funder, &10000);
    let expiration = env.ledger().timestamp() + 500;
    let bounty_id = client.create_bounty(
        &funder,
        &Symbol::new(&env, "Multi_Dev_Feature"),
        &10000,
        &expiration,
    );

    let evidence_hash = BytesN::from_array(&env, &[9u8; 32]);
    let claimants = vec![&env, dev1.clone(), dev2.clone(), dev3.clone()];
    // 50% (5000 bps), 30% (3000 bps), 20% (2000 bps)
    let split_bps = vec![&env, 5000u32, 3000u32, 2000u32];

    client.claim_bounty_collaborative(
        &dev1,
        &bounty_id,
        &claimants,
        &split_bps,
        &evidence_hash,
    );

    client.verify_and_payout(&funder, &bounty_id);

    assert_eq!(token_client.balance(&dev1), 5000);
    assert_eq!(token_client.balance(&dev2), 3000);
    assert_eq!(token_client.balance(&dev3), 2000);
    assert_eq!(token_client.balance(&contract_addr), 0);
}

#[test]
fn test_bounty_expired_refund() {
    let (env, _, token_client, token_admin, contract_addr, client) = setup();

    let funder = Address::generate(&env);
    token_admin.mint(&funder, &3000);

    let expiration = env.ledger().timestamp() + 100;
    let bounty_id = client.create_bounty(
        &funder,
        &Symbol::new(&env, "Unfinished_Task"),
        &3000,
        &expiration,
    );

    // Attempting refund before expiration should fail
    let refund_early = client.try_claim_refund(&funder, &bounty_id);
    assert!(refund_early.is_err());

    // Advance ledger timestamp beyond expiration
    env.ledger().with_mut(|li| {
        li.timestamp += 200;
    });

    // Now refund succeeds 100%
    client.claim_refund(&funder, &bounty_id);
    assert_eq!(token_client.balance(&funder), 3000);
    assert_eq!(token_client.balance(&contract_addr), 0);

    let bounty = client.get_bounty(&bounty_id).unwrap();
    assert_eq!(bounty.status, bounty::BountyStatus::Refunded);
}
