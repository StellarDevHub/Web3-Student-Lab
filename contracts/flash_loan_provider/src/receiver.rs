use soroban_sdk::{Address, Bytes, Env};

pub trait FlashLoanReceiver {
    fn execute_operation(
        env: Env,
        caller: Address,
        token: Address,
        amount: i128,
        fee: i128,
        params: Bytes,
    );
}
