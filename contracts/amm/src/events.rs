use contract_events::{publish_standard_event, topic};
use soroban_sdk::{Address, Env};

pub fn initialized(
    env: &Env,
    admin: &Address,
    token_a: &Address,
    token_b: &Address,
    pool_share: &Address,
    fee_collector: &Address,
    base_fee_bps: i128,
) {
    publish_standard_event(
        env,
        topic::AMM_INITIALIZED,
        admin.clone(),
        (
            token_a.clone(),
            token_b.clone(),
            pool_share.clone(),
            fee_collector.clone(),
            base_fee_bps,
            env.ledger().timestamp(),
        ),
    );
}

pub fn guardian_changed(env: &Env, admin: &Address, guardian: &Address) {
    publish_standard_event(
        env,
        topic::AMM_GUARDIAN,
        guardian.clone(),
        (admin.clone(), env.ledger().timestamp()),
    );
}

pub fn liquidity_added(
    env: &Env,
    provider: &Address,
    amount_a: i128,
    amount_b: i128,
    shares: i128,
    reserve_a: i128,
    reserve_b: i128,
) {
    publish_standard_event(
        env,
        topic::LIQUIDITY_ADDED,
        provider.clone(),
        (
            amount_a,
            amount_b,
            shares,
            reserve_a,
            reserve_b,
            env.ledger().timestamp(),
        ),
    );
}

pub fn liquidity_removed(
    env: &Env,
    provider: &Address,
    amount_a: i128,
    amount_b: i128,
    shares: i128,
    reserve_a: i128,
    reserve_b: i128,
) {
    publish_standard_event(
        env,
        topic::LIQUIDITY_REMOVED,
        provider.clone(),
        (
            amount_a,
            amount_b,
            shares,
            reserve_a,
            reserve_b,
            env.ledger().timestamp(),
        ),
    );
}

pub fn swap_a_for_b(
    env: &Env,
    trader: &Address,
    amount_in: i128,
    amount_out: i128,
    fee: i128,
    reserve_a: i128,
    reserve_b: i128,
) {
    publish_standard_event(
        env,
        topic::SWAP_A_FOR_B,
        trader.clone(),
        (
            amount_in,
            amount_out,
            fee,
            reserve_a,
            reserve_b,
            env.ledger().timestamp(),
        ),
    );
}

pub fn swap_b_for_a(
    env: &Env,
    trader: &Address,
    amount_in: i128,
    amount_out: i128,
    fee: i128,
    reserve_a: i128,
    reserve_b: i128,
) {
    publish_standard_event(
        env,
        topic::SWAP_B_FOR_A,
        trader.clone(),
        (
            amount_in,
            amount_out,
            fee,
            reserve_a,
            reserve_b,
            env.ledger().timestamp(),
        ),
    );
}

pub fn pause_changed(env: &Env, caller: &Address, paused: bool) {
    publish_standard_event(
        env,
        topic::PAUSE,
        caller.clone(),
        (paused, env.ledger().timestamp()),
    );
}
