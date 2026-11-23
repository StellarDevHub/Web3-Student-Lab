use soroban_sdk::{panic_with_error, symbol_short, Env, Symbol};

use crate::VaultError;

const LOCK_KEY: Symbol = symbol_short!("sv_rg");

pub(crate) fn lock(env: &Env) {
    if env.storage().temporary().has(&LOCK_KEY) {
        panic_with_error!(env, VaultError::ReentrancyGuardTriggered);
    }
    env.storage().temporary().set(&LOCK_KEY, &true);
}

pub(crate) fn unlock(env: &Env) {
    env.storage().temporary().remove(&LOCK_KEY);
}
