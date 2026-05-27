use crate::merkle_distributor;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
    Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AirdropError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidProof = 4,
    AlreadyClaimed = 5,
    DeadlineExceeded = 6,
    Blacklisted = 7,
    IdentityNotVerified = 8,
    DeadlineNotReached = 9,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Token,
    TokenId,
    MerkleRoot,
    Deadline,
    Claimed(Address),
    Blacklist(Address),
    Verified(Address),
    RequireVerification,
}

#[contract]
pub struct AirdropManager;

#[contractimpl]
impl AirdropManager {
    pub fn init(
        env: Env,
        admin: Address,
        token: Address,
        token_id: u32,
        merkle_root: BytesN<32>,
        deadline: u64,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, AirdropError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::TokenId, &token_id);
        env.storage()
            .instance()
            .set(&DataKey::MerkleRoot, &merkle_root);
        env.storage().instance().set(&DataKey::Deadline, &deadline);
        env.storage()
            .instance()
            .set(&DataKey::RequireVerification, &true);
    }

    pub fn claim(env: Env, user: Address, amount: i128, proof: Vec<BytesN<32>>) {
        user.require_auth();

        // 1. Check deadline
        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() > deadline {
            panic_with_error!(&env, AirdropError::DeadlineExceeded);
        }

        // 2. Check blacklist
        if env
            .storage()
            .instance()
            .get(&DataKey::Blacklist(user.clone()))
            .unwrap_or(false)
        {
            panic_with_error!(&env, AirdropError::Blacklisted);
        }

        // 3. Check verification if required
        let require_verification: bool = env
            .storage()
            .instance()
            .get(&DataKey::RequireVerification)
            .unwrap_or(false);
        if require_verification {
            let is_verified: bool = env
                .storage()
                .instance()
                .get(&DataKey::Verified(user.clone()))
                .unwrap_or(false);
            if !is_verified {
                panic_with_error!(&env, AirdropError::IdentityNotVerified);
            }
        }

        // 4. Check already claimed
        if env
            .storage()
            .persistent()
            .get(&DataKey::Claimed(user.clone()))
            .unwrap_or(false)
        {
            panic_with_error!(&env, AirdropError::AlreadyClaimed);
        }

        // 5. Verify proof
        let root: BytesN<32> = env.storage().instance().get(&DataKey::MerkleRoot).unwrap();
        let leaf = merkle_distributor::compute_leaf(&env, &user, amount);
        if !merkle_distributor::verify(&env, proof, &root, &leaf) {
            panic_with_error!(&env, AirdropError::InvalidProof);
        }

        // 6. Mark as claimed
        env.storage()
            .persistent()
            .set(&DataKey::Claimed(user.clone()), &true);
        // Extend TTL for claimed status
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Claimed(user.clone()), 1000, 5000);

        // 7. Transfer tokens
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_id: u32 = env.storage().instance().get(&DataKey::TokenId).unwrap();
        let client = crate::token::RsTokenContractClient::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &user, &token_id, &amount);

        // 8. Emit event
        env.events().publish(
            (Symbol::new(&env, "airdrop_claimed"), user.clone()),
            (amount,),
        );
    }

    pub fn set_merkle_root(env: Env, caller: Address, new_root: BytesN<32>) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, AirdropError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::MerkleRoot, &new_root);
    }

    pub fn set_blacklist(env: Env, caller: Address, user: Address, blacklisted: bool) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, AirdropError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Blacklist(user), &blacklisted);
    }

    pub fn set_verified(env: Env, caller: Address, user: Address, verified: bool) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, AirdropError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Verified(user), &verified);
    }

    pub fn set_require_verification(env: Env, caller: Address, required: bool) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, AirdropError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::RequireVerification, &required);
    }

    pub fn withdraw_remaining(env: Env, caller: Address, recipient: Address) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, AirdropError::Unauthorized);
        }

        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() <= deadline {
            panic_with_error!(&env, AirdropError::DeadlineNotReached);
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_id: u32 = env.storage().instance().get(&DataKey::TokenId).unwrap();
        let client = crate::token::RsTokenContractClient::new(&env, &token_addr);
        let balance = client.get_balance(&env.current_contract_address(), &token_id);
        if balance > 0 {
            client.transfer(
                &env.current_contract_address(),
                &recipient,
                &token_id,
                &balance,
            );
        }
    }
}
