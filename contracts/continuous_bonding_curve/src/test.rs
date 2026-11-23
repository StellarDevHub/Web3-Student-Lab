use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn client(env: &Env) -> ContinuousBondingCurveContractClient<'_> {
    let id = env.register(ContinuousBondingCurveContract, ());
    ContinuousBondingCurveContractClient::new(env, &id)
}

#[test]
fn buy_and_sell_flow_updates_supply_and_reserve() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &2, &100);

    let buy_cost =
        client.buy_exact_tokens(&user, &100, &30_000, &(env.ledger().timestamp() + 100));
    assert!(buy_cost > 0);

    let (supply, reserve) = client.state();
    assert_eq!(supply, 100);
    assert_eq!(reserve, buy_cost);

    let payout = client.sell_exact_tokens(&user, &40, &1, &(env.ledger().timestamp() + 100));
    assert!(payout > 0);

    let (supply_after, reserve_after) = client.state();
    assert_eq!(supply_after, 60);
    assert_eq!(reserve_after, buy_cost - payout);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn enforces_slippage_limits() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1, &50);

    let _ = client.buy_exact_tokens(&user, &100, &10, &(env.ledger().timestamp() + 100));
}

// ── Additional tests ──────────────────────────────────────────────────────────

/// Price increases monotonically on buy: buying in 3 successive tranches,
/// the cost-per-token for each tranche must be strictly greater than the previous.
#[test]
fn price_increases_monotonically_on_successive_buys() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    // slope = 1, base = 10
    client.initialize(&admin, &1, &10);

    let deadline = env.ledger().timestamp() + 1_000;
    let tranche = 10i128;

    let cost1 = client.buy_exact_tokens(&user, &tranche, &1_000_000, &deadline);
    let cost2 = client.buy_exact_tokens(&user, &tranche, &1_000_000, &deadline);
    let cost3 = client.buy_exact_tokens(&user, &tranche, &1_000_000, &deadline);

    // Each successive tranche starts at a higher supply → higher cost
    assert!(
        cost2 > cost1,
        "second tranche ({cost2}) should cost more than first ({cost1})"
    );
    assert!(
        cost3 > cost2,
        "third tranche ({cost3}) should cost more than second ({cost2})"
    );
}

/// Price decreases on sell: selling from a higher supply returns more per-token
/// than selling from a lower supply.
#[test]
fn price_decreases_on_sell_as_supply_drops() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1, &10);

    let deadline = env.ledger().timestamp() + 1_000;

    // Buy 60 tokens first so we have supply to sell back
    client.buy_exact_tokens(&user, &60, &1_000_000, &deadline);

    // First sell from supply = 60 (higher → higher price per token)
    let payout1 = client.sell_exact_tokens(&user, &10, &1, &deadline);
    // Second sell from supply = 50 (lower → lower price per token)
    let payout2 = client.sell_exact_tokens(&user, &10, &1, &deadline);

    assert!(
        payout1 > payout2,
        "selling at higher supply ({payout1}) should yield more than at lower supply ({payout2})"
    );
}

/// quote_buy must exactly match the cost returned by buy_exact_tokens.
#[test]
fn quote_buy_matches_actual_buy_cost() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &3, &50);

    let tokens = 25i128;
    let quoted = client.quote_buy(&tokens);

    let deadline = env.ledger().timestamp() + 500;
    let actual = client.buy_exact_tokens(&user, &tokens, &quoted, &deadline);

    assert_eq!(quoted, actual, "quote_buy must equal the actual buy cost");
}

/// quote_sell must exactly match the payout returned by sell_exact_tokens.
#[test]
fn quote_sell_matches_actual_sell_payout() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &2, &100);

    let deadline = env.ledger().timestamp() + 1_000;
    // Buy first so there is supply to sell
    client.buy_exact_tokens(&user, &50, &1_000_000, &deadline);

    let tokens_to_sell = 20i128;
    let quoted = client.quote_sell(&tokens_to_sell);
    let actual = client.sell_exact_tokens(&user, &tokens_to_sell, &1, &deadline);

    assert_eq!(quoted, actual, "quote_sell must equal the actual payout");
}

/// A deadline in the past must cause buy_exact_tokens to panic (DeadlinePassed #5).
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn deadline_in_past_is_rejected_on_buy() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1, &10);

    // Advance ledger so timestamp = 100
    env.ledger().with_mut(|l| l.timestamp = 100);
    // Deadline = 50 which is already past
    client.buy_exact_tokens(&user, &10, &1_000_000, &50);
}

/// A deadline in the past must cause sell_exact_tokens to panic (DeadlinePassed #5).
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn deadline_in_past_is_rejected_on_sell() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1, &10);

    // Buy some tokens first with a valid deadline
    client.buy_exact_tokens(&user, &50, &1_000_000, &(env.ledger().timestamp() + 1_000));

    // Advance ledger past a deadline value of 50
    env.ledger().with_mut(|l| l.timestamp = 100);
    client.sell_exact_tokens(&user, &10, &1, &50);
}

/// Selling more tokens than the current supply must panic (InsufficientSupply #7).
#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn sell_more_than_supply_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1, &10);

    let deadline = env.ledger().timestamp() + 500;
    // Buy only 20 tokens
    client.buy_exact_tokens(&user, &20, &1_000_000, &deadline);
    // Attempt to sell 50 (more than supply = 20)
    client.sell_exact_tokens(&user, &50, &1, &deadline);
}

/// initialize with zero slope must panic (InvalidAmount #3).
#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn initialize_with_zero_slope_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    client.initialize(&admin, &0, &100); // slope = 0 → InvalidAmount
}

/// Calling initialize a second time must panic (AlreadyInitialized #1).
#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn double_initialize_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    client.initialize(&admin, &1, &50);
    client.initialize(&admin, &2, &100); // second call → panic
}

/// quote_sell on a supply of zero (or requesting more than supply) panics
/// with InsufficientSupply (#7).
#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn quote_sell_when_supply_zero_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let client = client(&env);

    let admin = Address::generate(&env);
    client.initialize(&admin, &1, &10);

    // Supply = 0, asking to quote selling 5 tokens → InsufficientSupply
    client.quote_sell(&5);
}
