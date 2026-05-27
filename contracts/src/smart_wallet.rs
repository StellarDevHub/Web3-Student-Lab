//! Smart Contract Wallet with Account Abstraction (#407)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum WalletKey {
    Owner,
    Threshold,
    Signers,
    SessionKey(Address),
    Guardian(Address),
    GuardianCount,
    RecoveryThreshold,
    PendingRecovery,
    Nonce,
    Locked,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionKeyInfo {
    pub expiry_ledger: u32,
    pub spend_limit: i128,
    pub spent: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserOperation {
    pub wallet: Address,
    pub target: Address,
    pub function: String,
    pub value: i128,
    pub nonce: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingRecovery {
    pub new_owner: Address,
    pub approvals: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum WalletError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidThreshold = 4,
    SessionKeyExpired = 5,
    SessionKeySpendLimitExceeded = 6,
    InvalidNonce = 7,
    WalletLocked = 8,
}

#[contract]
pub struct SmartWalletContract;

#[contractimpl]
impl SmartWalletContract {
    pub fn initialize(
        env: Env,
        owner: Address,
        signers: Vec<Address>,
        threshold: u32,
        guardians: Vec<Address>,
        recovery_threshold: u32,
    ) {
        if env.storage().instance().has(&WalletKey::Owner) {
            panic_with_error!(&env, WalletError::AlreadyInitialized);
        }
        if threshold == 0 || threshold > signers.len() + 1 {
            panic_with_error!(&env, WalletError::InvalidThreshold);
        }

        env.storage().instance().set(&WalletKey::Owner, &owner);
        env.storage()
            .instance()
            .set(&WalletKey::Threshold, &threshold);
        env.storage().instance().set(&WalletKey::Signers, &signers);
        env.storage().instance().set(&WalletKey::Nonce, &0u64);
        env.storage().instance().set(&WalletKey::Locked, &false);
        env.storage()
            .instance()
            .set(&WalletKey::GuardianCount, &guardians.len());
        env.storage()
            .instance()
            .set(&WalletKey::RecoveryThreshold, &recovery_threshold);

        for guardian in guardians.iter() {
            env.storage()
                .instance()
                .set(&WalletKey::Guardian(guardian.clone()), &true);
        }

        env.events()
            .publish((symbol_short!("wallet"), symbol_short!("created")), owner);
    }

    pub fn add_session_key(
        env: Env,
        caller: Address,
        session_key: Address,
        expiry_ledger: u32,
        spend_limit: i128,
    ) {
        caller.require_auth();
        Self::assert_owner_or_signer(&env, &caller);
        Self::assert_not_locked(&env);

        env.storage().instance().set(
            &WalletKey::SessionKey(session_key.clone()),
            &SessionKeyInfo {
                expiry_ledger,
                spend_limit,
                spent: 0,
            },
        );

        env.events().publish(
            (symbol_short!("session"), symbol_short!("added")),
            session_key,
        );
    }

    pub fn revoke_session_key(env: Env, caller: Address, session_key: Address) {
        caller.require_auth();
        Self::assert_owner_or_signer(&env, &caller);
        env.storage()
            .instance()
            .remove(&WalletKey::SessionKey(session_key.clone()));

        env.events().publish(
            (symbol_short!("session"), symbol_short!("revoked")),
            session_key,
        );
    }

    pub fn execute_user_op(env: Env, caller: Address, op: UserOperation) {
        caller.require_auth();
        Self::assert_not_locked(&env);

        let stored_nonce: u64 = env.storage().instance().get(&WalletKey::Nonce).unwrap_or(0);
        if op.nonce != stored_nonce {
            panic_with_error!(&env, WalletError::InvalidNonce);
        }

        let owner: Address = env
            .storage()
            .instance()
            .get(&WalletKey::Owner)
            .unwrap_or_else(|| panic_with_error!(&env, WalletError::NotInitialized));

        if caller != owner && !Self::is_signer(&env, &caller) {
            let mut info: SessionKeyInfo = env
                .storage()
                .instance()
                .get(&WalletKey::SessionKey(caller.clone()))
                .unwrap_or_else(|| panic_with_error!(&env, WalletError::Unauthorized));

            if env.ledger().sequence() > info.expiry_ledger {
                panic_with_error!(&env, WalletError::SessionKeyExpired);
            }
            if info.spend_limit > 0 && info.spent + op.value > info.spend_limit {
                panic_with_error!(&env, WalletError::SessionKeySpendLimitExceeded);
            }
            info.spent += op.value;
            env.storage()
                .instance()
                .set(&WalletKey::SessionKey(caller), &info);
        }

        env.storage()
            .instance()
            .set(&WalletKey::Nonce, &(stored_nonce + 1));

        env.events().publish(
            (symbol_short!("userop"), symbol_short!("exec")),
            (op.target, op.nonce),
        );
    }

    pub fn execute_batch(env: Env, caller: Address, ops: Vec<UserOperation>) {
        caller.require_auth();
        Self::assert_not_locked(&env);
        Self::assert_owner_or_signer(&env, &caller);

        let mut nonce: u64 = env.storage().instance().get(&WalletKey::Nonce).unwrap_or(0);
        for op in ops.iter() {
            if op.nonce != nonce {
                panic_with_error!(&env, WalletError::InvalidNonce);
            }
            nonce += 1;
        }
        env.storage().instance().set(&WalletKey::Nonce, &nonce);
    }

    pub fn propose_recovery(env: Env, guardian: Address, new_owner: Address) {
        guardian.require_auth();

        let is_guardian: bool = env
            .storage()
            .instance()
            .get(&WalletKey::Guardian(guardian))
            .unwrap_or(false);
        if !is_guardian {
            panic_with_error!(&env, WalletError::Unauthorized);
        }

        let pending = PendingRecovery {
            new_owner: new_owner.clone(),
            approvals: 1,
        };
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&WalletKey::RecoveryThreshold)
            .unwrap_or(1);

        if pending.approvals >= threshold {
            env.storage().instance().set(&WalletKey::Owner, &new_owner);
            env.storage().instance().set(&WalletKey::Locked, &false);
        } else {
            env.storage()
                .instance()
                .set(&WalletKey::PendingRecovery, &pending);
            env.storage().instance().set(&WalletKey::Locked, &true);
        }
    }

    pub fn get_owner(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&WalletKey::Owner)
            .unwrap_or_else(|| panic_with_error!(&env, WalletError::NotInitialized))
    }

    pub fn get_nonce(env: Env) -> u64 {
        env.storage().instance().get(&WalletKey::Nonce).unwrap_or(0)
    }

    pub fn is_locked(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&WalletKey::Locked)
            .unwrap_or(false)
    }

    fn assert_not_locked(env: &Env) {
        let locked: bool = env
            .storage()
            .instance()
            .get(&WalletKey::Locked)
            .unwrap_or(false);
        if locked {
            panic_with_error!(env, WalletError::WalletLocked);
        }
    }

    fn assert_owner_or_signer(env: &Env, caller: &Address) {
        let owner: Address = env
            .storage()
            .instance()
            .get(&WalletKey::Owner)
            .unwrap_or_else(|| panic_with_error!(env, WalletError::NotInitialized));
        if *caller != owner && !Self::is_signer(env, caller) {
            panic_with_error!(env, WalletError::Unauthorized);
        }
    }

    fn is_signer(env: &Env, addr: &Address) -> bool {
        let signers: Vec<Address> = env
            .storage()
            .instance()
            .get(&WalletKey::Signers)
            .unwrap_or(Vec::new(env));
        signers.contains(addr)
    }
}
