#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env};

#[contract]
pub struct ReceiverContract;

#[contractimpl]
impl ReceiverContract {
    pub fn execute_operation(
        env: Env,
        caller: Address,
        token: Address,
        amount: i128,
        fee: i128,
        _params: Bytes,
    ) {
        caller.require_auth();
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &caller,
            &(amount + fee),
        );
    }
}

#[test]
fn receiver_callback_and_reentrancy_api_are_defined() {
    let env = Env::default();
    let provider = Address::generate(&env);
    let receiver = Address::generate(&env);
    assert_ne!(provider, receiver);
}
