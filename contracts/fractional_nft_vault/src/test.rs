use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env};

fn client(env: &Env) -> FractionalNftVaultContractClient<'_> {
    let id = env.register(FractionalNftVaultContract, ());
    FractionalNftVaultContractClient::new(env, &id)
}

#[test]
fn distributes_buyout_payout_pro_rata() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = BytesN::from_array(&env, &[7; 32]);

    client.initialize(&admin, &nft, &token_id);
    client.fractionalize(&admin, &1_000);
    client.transfer_shares(&admin, &user_a, &200);
    client.transfer_shares(&admin, &user_b, &300);

    let deadline = env.ledger().timestamp() + 10;
    client.propose_buyout(&admin, &10_000, &deadline);

    client.vote_buyout(&admin, &true);
    client.vote_buyout(&user_a, &true);
    client.vote_buyout(&user_b, &true);

    env.ledger().with_mut(|li| li.timestamp = deadline + 1);
    client.finalize_buyout(&admin);

    let payout_admin = client.claim_buyout_payout(&admin);
    let payout_a = client.claim_buyout_payout(&user_a);
    let payout_b = client.claim_buyout_payout(&user_b);

    assert_eq!(payout_admin, 5_000);
    assert_eq!(payout_a, 2_000);
    assert_eq!(payout_b, 3_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn cannot_vote_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[1; 32]));
    client.fractionalize(&admin, &100);
    client.propose_buyout(&admin, &1_000, &(env.ledger().timestamp() + 20));

    client.vote_buyout(&admin, &true);
    client.vote_buyout(&admin, &false);
}

// ── Additional tests ──────────────────────────────────────────────────────────

/// transfer_shares moves balances from sender to receiver correctly.
#[test]
fn transfer_shares_moves_balances_correctly() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[2; 32]));
    client.fractionalize(&admin, &1_000);

    assert_eq!(client.share_balance(&admin), 1_000);
    assert_eq!(client.share_balance(&recipient), 0);

    client.transfer_shares(&admin, &recipient, &300);

    assert_eq!(client.share_balance(&admin), 700);
    assert_eq!(client.share_balance(&recipient), 300);
}

/// Transferring more shares than owned must panic with NoShares (#11).
#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn cannot_transfer_more_than_owned() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[3; 32]));
    client.fractionalize(&admin, &100);

    // Admin only has 100, attempt to transfer 200
    client.transfer_shares(&admin, &recipient, &200);
}

/// finalize_buyout must panic with BuyoutNotApproved (#8) when
/// yes_votes do not exceed 50 % of total shares.
#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn buyout_rejected_when_yes_votes_not_majority() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[4; 32]));
    // Total shares = 1_000; admin gets all initially then transfers most away
    client.fractionalize(&admin, &1_000);
    client.transfer_shares(&admin, &user_a, &400);
    client.transfer_shares(&admin, &user_b, &400);
    // admin has 200, user_a has 400, user_b has 400

    let deadline = env.ledger().timestamp() + 100;
    client.propose_buyout(&admin, &5_000, &deadline);

    // Only admin votes yes (200 out of 1_000 = 20 %) → not a majority
    client.vote_buyout(&admin, &true);
    // user_a and user_b do not vote

    env.ledger().with_mut(|l| l.timestamp = deadline + 1);
    client.finalize_buyout(&admin); // must panic
}

/// Claiming a payout a second time must panic with AlreadyClaimed (#10).
#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn double_claim_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[5; 32]));
    client.fractionalize(&admin, &100);

    let deadline = env.ledger().timestamp() + 10;
    client.propose_buyout(&admin, &1_000, &deadline);
    client.vote_buyout(&admin, &true);

    env.ledger().with_mut(|l| l.timestamp = deadline + 1);
    client.finalize_buyout(&admin);

    // First claim succeeds
    let _ = client.claim_buyout_payout(&admin);
    // Second claim must panic
    let _ = client.claim_buyout_payout(&admin);
}

/// propose_buyout with a voting_deadline in the past must panic (InvalidAmount #4).
#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn propose_buyout_with_past_deadline_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[6; 32]));
    client.fractionalize(&admin, &100);

    // Advance the ledger so timestamp = 200
    env.ledger().with_mut(|l| l.timestamp = 200);
    // Deadline = 100, already past
    client.propose_buyout(&admin, &1_000, &100);
}

/// fractionalize called by a non-admin address must panic (Unauthorized #3).
#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn fractionalize_by_non_admin_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[8; 32]));
    // non_admin is not the admin → must panic
    client.fractionalize(&non_admin, &500);
}

/// share_balance returns zero for an address that has never held shares.
#[test]
fn share_balance_returns_zero_for_unknown_address() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let stranger = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[9; 32]));
    client.fractionalize(&admin, &500);

    assert_eq!(client.share_balance(&stranger), 0i128);
}

/// Full pro-rata payout: total payouts across all shareholders sum to the
/// treasury (modulo integer division truncation).
#[test]
fn pro_rata_payouts_sum_correctly() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user_x = Address::generate(&env);
    let user_y = Address::generate(&env);
    let nft = Address::generate(&env);

    client.initialize(&admin, &nft, &BytesN::from_array(&env, &[10; 32]));
    // 600 total shares split: admin 100, x 200, y 300
    client.fractionalize(&admin, &600);
    client.transfer_shares(&admin, &user_x, &200);
    client.transfer_shares(&admin, &user_y, &300);

    let offer = 6_000i128;
    let deadline = env.ledger().timestamp() + 50;
    client.propose_buyout(&admin, &offer, &deadline);

    client.vote_buyout(&admin, &true);
    client.vote_buyout(&user_x, &true);
    client.vote_buyout(&user_y, &true);

    env.ledger().with_mut(|l| l.timestamp = deadline + 1);
    client.finalize_buyout(&admin);

    let p_admin = client.claim_buyout_payout(&admin);
    let p_x = client.claim_buyout_payout(&user_x);
    let p_y = client.claim_buyout_payout(&user_y);

    // admin: 100/600 * 6_000 = 1_000
    // x:     200/600 * 6_000 = 2_000
    // y:     300/600 * 6_000 = 3_000
    assert_eq!(p_admin, 1_000);
    assert_eq!(p_x, 2_000);
    assert_eq!(p_y, 3_000);
    assert_eq!(p_admin + p_x + p_y, offer);
}
