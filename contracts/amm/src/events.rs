use contract_events::{
    publish_amm_guardian_changed, publish_amm_initialized, publish_liquidity_added,
    publish_liquidity_removed, publish_pause, publish_swap_a_for_b, publish_swap_b_for_a,
};
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
    publish_amm_initialized(
        env,
        admin,
        token_a,
        token_b,
        pool_share,
        fee_collector,
        base_fee_bps,
    );
}

pub fn guardian_changed(env: &Env, admin: &Address, guardian: &Address) {
    publish_amm_guardian_changed(env, guardian, admin);
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
    publish_liquidity_added(
        env, provider, amount_a, amount_b, shares, reserve_a, reserve_b,
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
    publish_liquidity_removed(
        env, provider, amount_a, amount_b, shares, reserve_a, reserve_b,
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
    publish_swap_a_for_b(
        env, trader, amount_in, amount_out, fee, reserve_a, reserve_b,
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
    publish_swap_b_for_a(
        env, trader, amount_in, amount_out, fee, reserve_a, reserve_b,
    );
}

pub fn pause_changed(env: &Env, caller: &Address, paused: bool) {
    publish_pause(env, caller, paused);
}
