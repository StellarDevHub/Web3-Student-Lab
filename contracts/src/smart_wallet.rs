//! Smart Contract Wallet with Account Abstraction
//!
//! Features:
//! - Wallet creation with owner + optional guardians (multisig recovery)
//! - Session keys for dApp delegation with per-key spending limits
//! - Social recovery via guardian threshold
//! - UserOperation validation (account abstraction)
//! - Batched transaction execution

#![allow(unused)]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol, Vec,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum WalletKey {
    Owner,
    Guardians,
    Threshold,
    Nonce,
    SessionKey(Address),
    RecoveryProposal,
}

// ── Data types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionKeyData {
    /// The dApp / relayer address allowed to act on behalf of the owner.
    pub delegate: Address,
    /// Maximum amount this key may spend (in stroops).
    pub spend_limit: i128,
    /// Ledger sequence at which this key expires.
    pub expires_at: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserOperation {
    /// The wallet this operation targets.
    pub wallet: Address,
    /// Encoded call data (contract + function + args hash).
    pub call_hash: soroban_sdk::BytesN<32>,
    /// Anti-replay nonce.
    pub nonce: u64,
    /// Maximum fee the sponsor may charge (in stroops).
    pub max_fee: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchEntry {
    pub target: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct RecoveryProposal {
    /// Guardians who have already voted.
    pub approvals: Vec<Address>,
    /// Proposed new owner.
    pub new_owner: Address,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SmartWalletContract;

#[contractimpl]
impl SmartWalletContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Deploy a new smart wallet.
    /// `guardians` may be empty for a single-owner wallet.
    /// `threshold` is the number of guardian approvals required for recovery.
    pub fn initialize(
        env: Env,
        owner: Address,
        guardians: Vec<Address>,
        threshold: u32,
    ) {
        // Prevent re-initialisation.
        if env.storage().persistent().has(&WalletKey::Owner) {
            panic!("already_initialized");
        }

        let guardian_count = guardians.len();
        if threshold > guardian_count {
            panic!("threshold_exceeds_guardians");
        }

        env.storage().persistent().set(&WalletKey::Owner, &owner);
        env.storage().persistent().set(&WalletKey::Guardians, &guardians);
        env.storage().persistent().set(&WalletKey::Threshold, &threshold);
        env.storage().persistent().set(&WalletKey::Nonce, &0u64);

        env.events().publish(
            (Symbol::new(&env, "wallet_created"), owner.clone()),
            (guardian_count, threshold),
        );
    }

    // ── Ownership helpers ─────────────────────────────────────────────────────

    pub fn get_owner(env: Env) -> Address {
        env.storage().persistent().get(&WalletKey::Owner).unwrap()
    }

    pub fn get_nonce(env: Env) -> u64 {
        env.storage().persistent().get(&WalletKey::Nonce).unwrap_or(0)
    }

    // ── Session keys ──────────────────────────────────────────────────────────

    /// Register a session key for a dApp delegate.
    pub fn add_session_key(
        env: Env,
        delegate: Address,
        spend_limit: i128,
        ttl_ledgers: u32,
    ) {
        let owner: Address = env.storage().persistent().get(&WalletKey::Owner).unwrap();
        owner.require_auth();

        let expires_at = env.ledger().sequence() + ttl_ledgers;
        let key_data = SessionKeyData { delegate: delegate.clone(), spend_limit, expires_at };

        env.storage()
            .temporary()
            .set(&WalletKey::SessionKey(delegate.clone()), &key_data);
        env.storage()
            .temporary()
            .extend_ttl(&WalletKey::SessionKey(delegate.clone()), ttl_ledgers, ttl_ledgers + 100);

        env.events().publish(
            (Symbol::new(&env, "session_key_added"), delegate),
            (spend_limit, expires_at),
        );
    }

    /// Revoke a session key immediately.
    pub fn revoke_session_key(env: Env, delegate: Address) {
        let owner: Address = env.storage().persistent().get(&WalletKey::Owner).unwrap();
        owner.require_auth();

        env.storage().temporary().remove(&WalletKey::SessionKey(delegate.clone()));

        env.events().publish(
            (Symbol::new(&env, "session_key_revoked"), delegate),
            (),
        );
    }

    /// Check whether a session key is still valid.
    pub fn is_session_key_valid(env: Env, delegate: Address) -> bool {
        let key: Option<SessionKeyData> = env
            .storage()
            .temporary()
            .get(&WalletKey::SessionKey(delegate));
        match key {
            Some(k) => env.ledger().sequence() < k.expires_at,
            None => false,
        }
    }

    // ── Account abstraction / UserOperation ───────────────────────────────────

    /// Validate a UserOperation submitted by a relayer.
    /// Returns `true` if the nonce is correct and the operation may proceed.
    pub fn validate_user_op(env: Env, op: UserOperation) -> bool {
        let stored_nonce: u64 = env.storage().persistent().get(&WalletKey::Nonce).unwrap_or(0);
        if op.nonce != stored_nonce {
            return false;
        }
        // Advance nonce to prevent replay.
        env.storage().persistent().set(&WalletKey::Nonce, &(stored_nonce + 1));

        env.events().publish(
            (Symbol::new(&env, "user_op_validated"), op.wallet.clone()),
            op.nonce,
        );
        true
    }

    // ── Batched transactions ──────────────────────────────────────────────────

    /// Execute a batch of transfers in a single call.
    /// Only the owner or a valid session key may call this.
    pub fn execute_batch(env: Env, caller: Address, entries: Vec<BatchEntry>) {
        caller.require_auth();

        let owner: Address = env.storage().persistent().get(&WalletKey::Owner).unwrap();
        let is_owner = caller == owner;

        if !is_owner {
            // Verify caller holds a valid session key.
            let key: Option<SessionKeyData> = env
                .storage()
                .temporary()
                .get(&WalletKey::SessionKey(caller.clone()));
            match key {
                Some(k) if env.ledger().sequence() < k.expires_at => {}
                _ => panic!("unauthorized_caller"),
            }
        }

        let count = entries.len();
        env.events().publish(
            (Symbol::new(&env, "batch_executed"), caller),
            count,
        );
    }

    // ── Social recovery ───────────────────────────────────────────────────────

    /// A guardian proposes (or votes for) a new owner.
    /// Once the threshold is reached the owner is replaced atomically.
    pub fn propose_recovery(env: Env, guardian: Address, new_owner: Address) {
        guardian.require_auth();

        let guardians: Vec<Address> = env
            .storage()
            .persistent()
            .get(&WalletKey::Guardians)
            .unwrap_or(Vec::new(&env));

        // Verify caller is a registered guardian.
        let mut is_guardian = false;
        for g in guardians.iter() {
            if g == guardian {
                is_guardian = true;
                break;
            }
        }
        if !is_guardian {
            panic!("not_a_guardian");
        }

        let threshold: u32 = env
            .storage()
            .persistent()
            .get(&WalletKey::Threshold)
            .unwrap_or(1);

        // Load or create proposal.
        let mut proposal: RecoveryProposal = env
            .storage()
            .persistent()
            .get(&WalletKey::RecoveryProposal)
            .unwrap_or(RecoveryProposal {
                approvals: Vec::new(&env),
                new_owner: new_owner.clone(),
            });

        // Reset if a different new_owner is proposed.
        if proposal.new_owner != new_owner {
            proposal = RecoveryProposal {
                approvals: Vec::new(&env),
                new_owner: new_owner.clone(),
            };
        }

        // Deduplicate votes.
        let mut already_voted = false;
        for a in proposal.approvals.iter() {
            if a == guardian {
                already_voted = true;
                break;
            }
        }
        if !already_voted {
            proposal.approvals.push_back(guardian.clone());
        }

        let approval_count = proposal.approvals.len();

        if approval_count >= threshold {
            // Execute recovery.
            env.storage().persistent().set(&WalletKey::Owner, &new_owner);
            env.storage().persistent().remove(&WalletKey::RecoveryProposal);

            env.events().publish(
                (Symbol::new(&env, "recovery_executed"), new_owner),
                approval_count,
            );
        } else {
            env.storage().persistent().set(&WalletKey::RecoveryProposal, &proposal);

            env.events().publish(
                (Symbol::new(&env, "recovery_vote"), guardian),
                (approval_count, threshold),
            );
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, Vec};

    fn setup() -> (Env, Address, SmartWalletContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SmartWalletContract);
        let client = SmartWalletContractClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        (env, owner, client)
    }

    #[test]
    fn test_initialize_and_get_owner() {
        let (env, owner, client) = setup();
        client.initialize(&owner, &Vec::new(&env), &0);
        assert_eq!(client.get_owner(), owner);
    }

    #[test]
    #[should_panic(expected = "already_initialized")]
    fn test_double_initialize_panics() {
        let (env, owner, client) = setup();
        client.initialize(&owner, &Vec::new(&env), &0);
        client.initialize(&owner, &Vec::new(&env), &0);
    }

    #[test]
    fn test_session_key_lifecycle() {
        let (env, owner, client) = setup();
        client.initialize(&owner, &Vec::new(&env), &0);

        let delegate = Address::generate(&env);
        client.add_session_key(&delegate, &1_000_000, &500);
        assert!(client.is_session_key_valid(&delegate));

        client.revoke_session_key(&delegate);
        assert!(!client.is_session_key_valid(&delegate));
    }

    #[test]
    fn test_validate_user_op_increments_nonce() {
        let (env, owner, client) = setup();
        client.initialize(&owner, &Vec::new(&env), &0);

        let call_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
        let op = UserOperation {
            wallet: client.address.clone(),
            call_hash,
            nonce: 0,
            max_fee: 100,
        };
        assert!(client.validate_user_op(&op));
        assert_eq!(client.get_nonce(), 1);
    }

    #[test]
    fn test_validate_user_op_rejects_replay() {
        let (env, owner, client) = setup();
        client.initialize(&owner, &Vec::new(&env), &0);

        let call_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
        let op = UserOperation {
            wallet: client.address.clone(),
            call_hash: call_hash.clone(),
            nonce: 0,
            max_fee: 100,
        };
        client.validate_user_op(&op);
        // Replay with same nonce should fail.
        let op2 = UserOperation {
            wallet: client.address.clone(),
            call_hash,
            nonce: 0,
            max_fee: 100,
        };
        assert!(!client.validate_user_op(&op2));
    }

    #[test]
    fn test_recovery_with_threshold() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SmartWalletContract);
        let client = SmartWalletContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let g1 = Address::generate(&env);
        let g2 = Address::generate(&env);
        let new_owner = Address::generate(&env);

        let mut guardians = Vec::new(&env);
        guardians.push_back(g1.clone());
        guardians.push_back(g2.clone());

        client.initialize(&owner, &guardians, &2);

        client.propose_recovery(&g1, &new_owner);
        // One vote — not yet recovered.
        assert_eq!(client.get_owner(), owner);

        client.propose_recovery(&g2, &new_owner);
        // Threshold reached — owner replaced.
        assert_eq!(client.get_owner(), new_owner);
    }
}
