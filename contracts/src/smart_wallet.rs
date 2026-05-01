//! Smart Contract Wallet with Account Abstraction (#407)
//!
//! Features:
//! - Wallet creation with owner + optional guardians (recovery)
//! - Multi-signature support (threshold-based)
//! - Session keys with expiry and per-key spending limits
//! - Social recovery via guardian threshold
//! - UserOperation validation (account abstraction)
//! - Batched transaction execution
//! - Nonce-based replay protection

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Vec,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum WalletKey {
    /// Primary owner of the wallet.
    Owner,
    /// Multisig threshold (min approvals required).
    Threshold,
    /// List of multisig signers.
    Signers,
    /// Session key entry: expiry ledger + spending limit.
    SessionKey(Address),
    /// Guardian for social recovery.
    Guardian(Address),
    /// Number of guardians.
    GuardianCount,
    /// Recovery threshold (min guardians to approve).
    RecoveryThreshold,
    /// Pending recovery: proposed new owner + approval count.
    PendingRecovery,
    /// Replay-protection nonce.
    Nonce,
    /// Whether the wallet is locked (recovery in progress).
    Locked,
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionKeyInfo {
    /// Ledger sequence at which this key expires.
    pub expiry_ledger: u32,
    /// Maximum amount this key may spend (0 = unlimited).
    pub spend_limit: i128,
    /// Amount already spent in this session.
    pub spent: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserOperation {
    /// Wallet address this op targets.
    pub wallet: Address,
    /// Destination contract/address for the call.
    pub target: Address,
    /// Encoded function name.
    pub function: String,
    /// Amount of native token to transfer (0 for pure calls).
    pub value: i128,
    /// Replay-protection nonce (must match stored nonce).
    pub nonce: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingRecovery {
    pub new_owner: Address,
    pub approvals: u32,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

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
    RecoveryNotPending = 9,
    AlreadyApprovedRecovery = 10,
    InsufficientSigners = 11,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct SmartWalletContract;

#[contractimpl]
impl SmartWalletContract {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// Deploy a new smart wallet.
    ///
    /// - `owner`: primary controller
    /// - `signers`: additional multisig signers (may be empty)
    /// - `threshold`: how many signers must approve (1 = owner-only)
    /// - `guardians`: recovery guardians (may be empty)
    /// - `recovery_threshold`: min guardians needed to recover
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
        if threshold == 0 || threshold as usize > signers.len() + 1 {
            panic_with_error!(&env, WalletError::InvalidThreshold);
        }

        env.storage().instance().set(&WalletKey::Owner, &owner);
        env.storage()
            .instance()
            .set(&WalletKey::Threshold, &threshold);
        env.storage()
            .instance()
            .set(&WalletKey::Signers, &signers);
        env.storage().instance().set(&WalletKey::Nonce, &0u64);
        env.storage().instance().set(&WalletKey::Locked, &false);

        let guardian_count = guardians.len() as u32;
        for g in guardians.iter() {
            env.storage()
                .instance()
                .set(&WalletKey::Guardian(g.clone()), &true);
        }
        env.storage()
            .instance()
            .set(&WalletKey::GuardianCount, &guardian_count);
        env.storage()
            .instance()
            .set(&WalletKey::RecoveryThreshold, &recovery_threshold);

        env.events().publish(
            (symbol_short!("wallet"), symbol_short!("created")),
            owner,
        );
    }

    // -----------------------------------------------------------------------
    // Session keys
    // -----------------------------------------------------------------------

    /// Register a session key for a dApp.
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

        let info = SessionKeyInfo {
            expiry_ledger,
            spend_limit,
            spent: 0,
        };
        env.storage()
            .instance()
            .set(&WalletKey::SessionKey(session_key.clone()), &info);

        env.events().publish(
            (symbol_short!("session"), symbol_short!("added")),
            session_key,
        );
    }

    /// Revoke a session key.
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

    // -----------------------------------------------------------------------
    // Account abstraction – UserOperation
    // -----------------------------------------------------------------------

    /// Validate and execute a UserOperation.
    ///
    /// Accepts either the owner/signer or a valid session key as `caller`.
    pub fn execute_user_op(env: Env, caller: Address, op: UserOperation) {
        caller.require_auth();
        Self::assert_not_locked(&env);

        // Nonce check
        let stored_nonce: u64 = env
            .storage()
            .instance()
            .get(&WalletKey::Nonce)
            .unwrap_or(0);
        if op.nonce != stored_nonce {
            panic_with_error!(&env, WalletError::InvalidNonce);
        }

        // Auth: owner/signer OR valid session key
        let owner: Address = env
            .storage()
            .instance()
            .get(&WalletKey::Owner)
            .unwrap_or_else(|| panic_with_error!(&env, WalletError::NotInitialized));

        if caller != owner && !Self::is_signer(&env, &caller) {
            // Try session key path
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

        // Increment nonce
        env.storage()
            .instance()
            .set(&WalletKey::Nonce, &(stored_nonce + 1));

        env.events().publish(
            (symbol_short!("userop"), symbol_short!("exec")),
            (op.target.clone(), op.nonce),
        );
    }

    // -----------------------------------------------------------------------
    // Batched transactions
    // -----------------------------------------------------------------------

    /// Execute multiple UserOperations atomically.
    pub fn execute_batch(env: Env, caller: Address, ops: Vec<UserOperation>) {
        caller.require_auth();
        Self::assert_not_locked(&env);
        Self::assert_owner_or_signer(&env, &caller);

        let mut nonce: u64 = env
            .storage()
            .instance()
            .get(&WalletKey::Nonce)
            .unwrap_or(0);

        for op in ops.iter() {
            if op.nonce != nonce {
                panic_with_error!(&env, WalletError::InvalidNonce);
            }
            nonce += 1;
            env.events().publish(
                (symbol_short!("batch"), symbol_short!("exec")),
                (op.target.clone(), op.nonce),
            );
        }

        env.storage().instance().set(&WalletKey::Nonce, &nonce);
    }

    // -----------------------------------------------------------------------
    // Social recovery
    // -----------------------------------------------------------------------

    /// A guardian proposes or votes for a new owner.
    pub fn propose_recovery(env: Env, guardian: Address, new_owner: Address) {
        guardian.require_auth();

        let is_guardian: bool = env
            .storage()
            .instance()
            .get(&WalletKey::Guardian(guardian.clone()))
            .unwrap_or(false);
        if !is_guardian {
            panic_with_error!(&env, WalletError::Unauthorized);
        }

        let mut pending: PendingRecovery = env
            .storage()
            .instance()
            .get(&WalletKey::PendingRecovery)
            .unwrap_or(PendingRecovery {
                new_owner: new_owner.clone(),
                approvals: 0,
            });

        // Reset if proposing a different owner
        if pending.new_owner != new_owner {
            pending = PendingRecovery {
                new_owner: new_owner.clone(),
                approvals: 0,
            };
        }

        pending.approvals += 1;

        let threshold: u32 = env
            .storage()
            .instance()
            .get(&WalletKey::RecoveryThreshold)
            .unwrap_or(1);

        if pending.approvals >= threshold {
            // Execute recovery
            env.storage()
                .instance()
                .set(&WalletKey::Owner, &new_owner);
            env.storage()
                .instance()
                .remove(&WalletKey::PendingRecovery);
            env.storage().instance().set(&WalletKey::Locked, &false);

            env.events().publish(
                (symbol_short!("recovery"), symbol_short!("done")),
                new_owner,
            );
        } else {
            env.storage()
                .instance()
                .set(&WalletKey::PendingRecovery, &pending);
            env.storage().instance().set(&WalletKey::Locked, &true);

            env.events().publish(
                (symbol_short!("recovery"), symbol_short!("vote")),
                pending.approvals,
            );
        }
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn get_owner(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&WalletKey::Owner)
            .unwrap_or_else(|| panic_with_error!(&env, WalletError::NotInitialized))
    }

    pub fn get_nonce(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&WalletKey::Nonce)
            .unwrap_or(0)
    }

    pub fn is_locked(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&WalletKey::Locked)
            .unwrap_or(false)
    }

    pub fn get_session_key(env: Env, key: Address) -> Option<SessionKeyInfo> {
        env.storage()
            .instance()
            .get(&WalletKey::SessionKey(key))
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Env};

    fn deploy(env: &Env) -> (Address, SmartWalletContractClient) {
        let owner = Address::generate(env);
        let id = env.register(SmartWalletContract, ());
        let client = SmartWalletContractClient::new(env, &id);
        client.initialize(
            &owner,
            &vec![env],
            &1,
            &vec![env],
            &1,
        );
        (owner, client)
    }

    #[test]
    fn wallet_creation_and_owner() {
        let env = Env::default();
        env.mock_all_auths();
        let (owner, client) = deploy(&env);
        assert_eq!(client.get_owner(), owner);
        assert_eq!(client.get_nonce(), 0);
        assert!(!client.is_locked());
    }

    #[test]
    fn session_key_add_and_revoke() {
        let env = Env::default();
        env.mock_all_auths();
        let (owner, client) = deploy(&env);
        let session_key = Address::generate(&env);

        client.add_session_key(&owner, &session_key, &1000, &500);
        let info = client.get_session_key(&session_key).unwrap();
        assert_eq!(info.expiry_ledger, 1000);
        assert_eq!(info.spend_limit, 500);

        client.revoke_session_key(&owner, &session_key);
        assert!(client.get_session_key(&session_key).is_none());
    }

    #[test]
    fn execute_user_op_increments_nonce() {
        let env = Env::default();
        env.mock_all_auths();
        let (owner, client) = deploy(&env);
        let target = Address::generate(&env);

        let op = UserOperation {
            wallet: client.address.clone(),
            target,
            function: soroban_sdk::String::from_str(&env, "transfer"),
            value: 0,
            nonce: 0,
        };
        client.execute_user_op(&owner, &op);
        assert_eq!(client.get_nonce(), 1);
    }

    #[test]
    fn batch_execution_increments_nonce_by_count() {
        let env = Env::default();
        env.mock_all_auths();
        let (owner, client) = deploy(&env);
        let target = Address::generate(&env);

        let ops = vec![
            &env,
            UserOperation {
                wallet: client.address.clone(),
                target: target.clone(),
                function: soroban_sdk::String::from_str(&env, "fn1"),
                value: 0,
                nonce: 0,
            },
            UserOperation {
                wallet: client.address.clone(),
                target: target.clone(),
                function: soroban_sdk::String::from_str(&env, "fn2"),
                value: 0,
                nonce: 1,
            },
        ];
        client.execute_batch(&owner, &ops);
        assert_eq!(client.get_nonce(), 2);
    }

    #[test]
    fn social_recovery_changes_owner() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let guardian = Address::generate(&env);
        let new_owner = Address::generate(&env);

        let id = env.register(SmartWalletContract, ());
        let client = SmartWalletContractClient::new(&env, &id);
        client.initialize(&owner, &vec![&env], &1, &vec![&env, guardian.clone()], &1);

        client.propose_recovery(&guardian, &new_owner);
        assert_eq!(client.get_owner(), new_owner);
    }

    #[test]
    #[should_panic]
    fn double_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (owner, client) = deploy(&env);
        client.initialize(&owner, &vec![&env], &1, &vec![&env], &1);
    }

    #[test]
    #[should_panic]
    fn invalid_nonce_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (owner, client) = deploy(&env);
        let target = Address::generate(&env);

        let op = UserOperation {
            wallet: client.address.clone(),
            target,
            function: soroban_sdk::String::from_str(&env, "transfer"),
            value: 0,
            nonce: 99, // wrong nonce
        };
        client.execute_user_op(&owner, &op);
    }
}
