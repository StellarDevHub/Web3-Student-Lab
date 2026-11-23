use soroban_sdk::{token, Address, Env};

pub(crate) fn is_fully_collateralized(
    env: &Env,
    reserve_token: &Address,
    liabilities: i128,
) -> bool {
    if liabilities < 0 {
        return false;
    }
    let contract_address = env.current_contract_address();
    token::Client::new(env, reserve_token)
        .balance(&contract_address)
        .checked_sub(liabilities)
        .map(|surplus| surplus >= 0)
        .unwrap_or(false)
}
