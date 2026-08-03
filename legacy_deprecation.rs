use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

/// This module is intended to be integrated into an existing token contract
/// via a contract upgrade. It cannot function as a standalone contract.

#[contracttype]
#[derive(Clone, Default)]
pub struct DeprecationStatus {
    pub is_deprecated: bool,
    pub migration_contract: Option<Address>,
    pub deprecation_timestamp: u64,
}

#[contracttype]
pub enum DeprecationDataKey {
    Status,
}

pub trait DeprecationTrait {
    /// Deprecates the contract, allowing transfers only to the migration contract.
    /// Must only be callable by the contract admin.
    fn deprecate(env: Env, migration_contract: Address);

    /// Helper function to check transfer validity during deprecation.
    fn check_deprecation_status(env: &Env, to: &Address);
}

pub fn deprecate(env: Env, migration_contract: Address) {
    // This function assumes it's called from within the legacy token contract
    // and that admin authorization has already been checked.
    let status = DeprecationStatus {
        is_deprecated: true,
        migration_contract: Some(migration_contract.clone()),
        deprecation_timestamp: env.ledger().timestamp(),
    };
    env.storage().instance().set(&DeprecationDataKey::Status, &status);

    env.events().publish(
        (String::from_slice(&env, "deprecated"),),
        (migration_contract,),
    );
}

pub fn check_deprecation_status(env: &Env, to: &Address) {
    if let Some(status) = env.storage().instance().get::<_, DeprecationStatus>(&DeprecationDataKey::Status) {
        if status.is_deprecated {
            let migration_target = status.migration_contract.unwrap();
            if to != &migration_target {
                panic!("Contract deprecated; transfers only allowed to the migration contract");
            }
        }
    }
}
