//! Tests for the multi-stakeholder escrow feature (#1416 / SC-HARD-35).
//!
//! Focus areas:
//!  - Correct proportional splitting (including rounding-remainder
//!    handling so no dust is created or lost).
//!  - Share validation (must sum to 10_000 bps, no duplicates, no
//!    zero-bps entries, must be non-empty).
//!  - Authorization (only payer/admin may distribute or cancel).
//!  - Double-distribution / double-cancellation guards.
//!  - The actual DoS-prevention property: one stakeholder never
//!    withdrawing their credited balance has zero effect on any other
//!    stakeholder's ability to withdraw theirs.

use super::*;
use soroban_sdk::{testutils::Address as _, token, vec, Env};

fn setup() -> (Env, Address, PaymentGatewayClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(PaymentGateway, ());
    let admin = Address::generate(&env);
    let client = PaymentGatewayClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, admin, client)
}

#[test]
fn test_create_escrow_locks_payer_balance() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice.clone(),
            bps: 6_000,
        },
        EscrowShare {
            stakeholder: bob.clone(),
            bps: 4_000,
        },
    ];

    let escrow = client.create_escrow(&payer, &1u64, &shares, &10_000);

    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.total_amount, 10_000);
    // Locked into the escrow, no longer part of the payer's spendable balance.
    assert_eq!(client.get_balance(&payer), 0);
    // Not yet credited to stakeholders either.
    assert_eq!(client.get_balance(&alice), 0);
    assert_eq!(client.get_balance(&bob), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_create_escrow_insufficient_balance_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);

    client.deposit(&payer, &100);
    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 10_000,
        },
    ];

    client.create_escrow(&payer, &1u64, &shares, &10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_create_escrow_shares_not_summing_to_10000_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.deposit(&payer, &10_000);
    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 5_000,
        },
        EscrowShare {
            stakeholder: bob,
            bps: 4_000,
        },
    ];

    client.create_escrow(&payer, &1u64, &shares, &10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_create_escrow_empty_shares_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares: Vec<EscrowShare> = vec![&env];
    client.create_escrow(&payer, &1u64, &shares, &10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_create_escrow_zero_bps_share_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 0,
        },
        EscrowShare {
            stakeholder: bob,
            bps: 10_000,
        },
    ];

    client.create_escrow(&payer, &1u64, &shares, &10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_create_escrow_duplicate_stakeholder_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice.clone(),
            bps: 5_000,
        },
        EscrowShare {
            stakeholder: alice,
            bps: 5_000,
        },
    ];

    client.create_escrow(&payer, &1u64, &shares, &10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_create_escrow_duplicate_id_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    client.deposit(&payer, &20_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 10_000,
        },
    ];

    client.create_escrow(&payer, &1u64, &shares, &10_000);
    client.create_escrow(&payer, &1u64, &shares, &10_000);
}

#[test]
fn test_distribute_escrow_credits_stakeholders_proportionally() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    client.deposit(&payer, &10_000);
    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice.clone(),
            bps: 5_000,
        },
        EscrowShare {
            stakeholder: bob.clone(),
            bps: 3_000,
        },
        EscrowShare {
            stakeholder: carol.clone(),
            bps: 2_000,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &10_000);

    let escrow = client.distribute_escrow(&payer, &1u64);

    assert_eq!(escrow.status, EscrowStatus::Distributed);
    assert_eq!(client.get_balance(&alice), 5_000);
    assert_eq!(client.get_balance(&bob), 3_000);
    assert_eq!(client.get_balance(&carol), 2_000);
    // No dust: exactly the escrowed amount was distributed in total.
    assert_eq!(
        client.get_balance(&alice) + client.get_balance(&bob) + client.get_balance(&carol),
        10_000
    );
}

#[test]
fn test_distribute_escrow_rounding_remainder_goes_to_last_stakeholder() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    // 10_000 split three ways (3_333 bps each + 1 bps) doesn't divide the
    // raw amount evenly — verifies the remainder-to-last-stakeholder rule
    // conserves the total exactly instead of losing/creating dust.
    client.deposit(&payer, &100);
    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice.clone(),
            bps: 3_333,
        },
        EscrowShare {
            stakeholder: bob.clone(),
            bps: 3_333,
        },
        EscrowShare {
            stakeholder: carol.clone(),
            bps: 3_334,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &100);
    client.distribute_escrow(&payer, &1u64);

    let total = client.get_balance(&alice) + client.get_balance(&bob) + client.get_balance(&carol);
    assert_eq!(total, 100);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_distribute_escrow_twice_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 10_000,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &10_000);
    client.distribute_escrow(&payer, &1u64);
    client.distribute_escrow(&payer, &1u64);
}

#[test]
fn test_admin_can_distribute_on_payers_behalf() {
    let (env, admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice.clone(),
            bps: 10_000,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &10_000);

    // Admin, not the payer, triggers distribution.
    let escrow = client.distribute_escrow(&admin, &1u64);
    assert_eq!(escrow.status, EscrowStatus::Distributed);
    assert_eq!(client.get_balance(&alice), 10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_unrelated_caller_cannot_distribute() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    let stranger = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 10_000,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &10_000);

    client.distribute_escrow(&stranger, &1u64);
}

#[test]
fn test_cancel_escrow_returns_funds_to_payer() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 10_000,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &10_000);
    assert_eq!(client.get_balance(&payer), 0);

    let escrow = client.cancel_escrow(&payer, &1u64);

    assert_eq!(escrow.status, EscrowStatus::Cancelled);
    assert_eq!(client.get_balance(&payer), 10_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_cancel_already_distributed_escrow_panics() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env);
    client.deposit(&payer, &10_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice,
            bps: 10_000,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &10_000);
    client.distribute_escrow(&payer, &1u64);
    client.cancel_escrow(&payer, &1u64);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_get_nonexistent_escrow_panics() {
    let (_env, _admin, client) = setup();
    client.get_escrow(&999u64);
}

/// The actual security property #1416 is about: a stakeholder that never
/// withdraws (modeling an unresponsive, malicious, or reverting
/// recipient in a push-based design) must not be able to block any other
/// stakeholder's payout. Because `distribute_escrow` only *credits*
/// balances rather than pushing funds out, every stakeholder's ability
/// to withdraw is fully independent of what any other stakeholder does.
#[test]
fn test_one_stakeholder_never_withdrawing_does_not_block_others() {
    let (env, _admin, client) = setup();
    let payer = Address::generate(&env);
    let alice = Address::generate(&env); // will withdraw
    let bob = Address::generate(&env); // "unresponsive" — never withdraws
    let carol = Address::generate(&env); // will also withdraw, after Bob's turn

    client.deposit(&payer, &9_000);
    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice.clone(),
            bps: 4_000,
        },
        EscrowShare {
            stakeholder: bob.clone(),
            bps: 3_000,
        },
        EscrowShare {
            stakeholder: carol.clone(),
            bps: 3_000,
        },
    ];
    client.create_escrow(&payer, &1u64, &shares, &9_000);

    // Distribution succeeds in one call for every stakeholder — it is not
    // a per-stakeholder push that could get stuck on Bob.
    client.distribute_escrow(&payer, &1u64);

    assert_eq!(client.get_balance(&alice), 3_600);
    assert_eq!(client.get_balance(&bob), 2_700);
    assert_eq!(client.get_balance(&carol), 2_700);

    // Alice withdraws immediately.
    let alice_withdrawn = client.withdraw(&alice, &3_600);
    assert_eq!(alice_withdrawn, 3_600);
    assert_eq!(client.get_balance(&alice), 0);

    // Bob never calls withdraw — his credited balance just sits there.
    assert_eq!(client.get_balance(&bob), 2_700);

    // Carol can still withdraw her full share, completely unaffected by
    // Bob never having withdrawn his.
    let carol_withdrawn = client.withdraw(&carol, &2_700);
    assert_eq!(carol_withdrawn, 2_700);
    assert_eq!(client.get_balance(&carol), 0);

    // Bob's balance is untouched and fully available to him whenever he
    // chooses to withdraw — the escrow never needed him to act.
    assert_eq!(client.get_balance(&bob), 2_700);
}

#[test]
fn test_multiple_escrows_are_independent() {
    let (env, _admin, client) = setup();
    let payer1 = Address::generate(&env);
    let payer2 = Address::generate(&env);
    let alice = Address::generate(&env);

    client.deposit(&payer1, &5_000);
    client.deposit(&payer2, &7_000);

    let shares = vec![
        &env,
        EscrowShare {
            stakeholder: alice.clone(),
            bps: 10_000,
        },
    ];

    client.create_escrow(&payer1, &1u64, &shares, &5_000);
    client.create_escrow(&payer2, &2u64, &shares, &7_000);

    client.distribute_escrow(&payer1, &1u64);
    assert_eq!(client.get_balance(&alice), 5_000);

    // Second escrow is untouched by the first's distribution.
    let escrow2 = client.get_escrow(&2u64);
    assert_eq!(escrow2.status, EscrowStatus::Funded);

    client.distribute_escrow(&payer2, &2u64);
    assert_eq!(client.get_balance(&alice), 12_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// SC-039 — Multi-Token Payment Splitter Tests
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_payment_splitter_multi_token_proportional_release() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PaymentSplitter, ());
    let client = PaymentSplitterClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    // 50% to Alice, 30% to Bob, 20% to Carol (total 100 shares)
    let payees = vec![&env, alice.clone(), bob.clone(), carol.clone()];
    let shares = vec![&env, 50u32, 30u32, 20u32];

    client.initialize(&payees, &shares);

    assert_eq!(client.total_shares(), 100u128);
    assert_eq!(client.shares(&alice), 50u32);
    assert_eq!(client.shares(&bob), 30u32);
    assert_eq!(client.shares(&carol), 20u32);

    // Setup Token A (e.g., USDC)
    let token_admin_a = Address::generate(&env);
    let token_a = env
        .register_stellar_asset_contract_v2(token_admin_a.clone())
        .address();
    let token_a_admin = token::StellarAssetClient::new(&env, &token_a);

    // Setup Token B (e.g., XLM)
    let token_admin_b = Address::generate(&env);
    let token_b = env
        .register_stellar_asset_contract_v2(token_admin_b.clone())
        .address();
    let token_b_admin = token::StellarAssetClient::new(&env, &token_b);

    let donor = Address::generate(&env);
    token_a_admin.mint(&donor, &1_000_000);
    token_b_admin.mint(&donor, &500_000);

    // Deposit Token A (1,000,000)
    client.deposit(&donor, &token_a, &1_000_000);
    // Deposit Token B (500,000)
    client.deposit(&donor, &token_b, &500_000);

    // Check pending payments
    assert_eq!(client.pending_payment(&token_a, &alice), 500_000);
    assert_eq!(client.pending_payment(&token_a, &bob), 300_000);
    assert_eq!(client.pending_payment(&token_a, &carol), 200_000);

    assert_eq!(client.pending_payment(&token_b, &alice), 250_000);
    assert_eq!(client.pending_payment(&token_b, &bob), 150_000);
    assert_eq!(client.pending_payment(&token_b, &carol), 100_000);

    // Alice releases Token A
    let released_a_alice = client.release(&token_a, &alice);
    assert_eq!(released_a_alice, 500_000);
    assert_eq!(token::Client::new(&env, &token_a).balance(&alice), 500_000);
    assert_eq!(client.pending_payment(&token_a, &alice), 0);

    // Bob releases Token B
    let released_b_bob = client.release(&token_b, &bob);
    assert_eq!(released_b_bob, 150_000);
    assert_eq!(token::Client::new(&env, &token_b).balance(&bob), 150_000);
    assert_eq!(client.pending_payment(&token_b, &bob), 0);

    // Further deposits are split accurately without truncation loss
    token_a_admin.mint(&donor, &100_000);
    client.deposit(&donor, &token_a, &100_000);

    // Alice now has 50% of additional 100,000 = 50,000
    assert_eq!(client.pending_payment(&token_a, &alice), 50_000);
    let released_a_alice_2 = client.release(&token_a, &alice);
    assert_eq!(released_a_alice_2, 50_000);
    assert_eq!(token::Client::new(&env, &token_a).balance(&alice), 550_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_payment_splitter_rejects_duplicate_payees() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PaymentSplitter, ());
    let client = PaymentSplitterClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let payees = vec![&env, alice.clone(), alice.clone()];
    let shares = vec![&env, 50u32, 50u32];

    client.initialize(&payees, &shares);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_payment_splitter_rejects_zero_shares() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PaymentSplitter, ());
    let client = PaymentSplitterClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let payees = vec![&env, alice, bob];
    let shares = vec![&env, 50u32, 0u32];

    client.initialize(&payees, &shares);
}
