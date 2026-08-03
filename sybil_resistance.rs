use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[contracttype]
pub enum DataKey {
    Admin,
    VerifiedUser(Address),
}

#[contract]
pub struct SybilResistanceContract;

#[contractimpl]
impl SybilResistanceContract {
    /// Initializes the Sybil resistance registry with an admin.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Verifies a user's identity, granting them a base identity for voting.
    /// Only the admin (or a designated identity oracle) can call this.
    pub fn verify_user(env: Env, user: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage().persistent().set(&DataKey::VerifiedUser(user.clone()), &true);

        env.events().publish((String::from_slice(&env, "user_verified"),), user);
    }

    /// Checks if a user has been verified as a unique human identity.
    pub fn is_verified(env: Env, user: Address) -> bool {
        env.storage().persistent().get(&DataKey::VerifiedUser(user)).unwrap_or(false)
    }

    /// Revokes a user's verified status if they are found to be a sybil account.
    pub fn revoke_user(env: Env, user: Address) {
         let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
         admin.require_auth();

         if env.storage().persistent().has(&DataKey::VerifiedUser(user.clone())) {
             env.storage().persistent().remove(&DataKey::VerifiedUser(user.clone()));
             env.events().publish((String::from_slice(&env, "user_revoked"),), user);
         } else {
             panic!("User is not verified");
         }
    }
}
