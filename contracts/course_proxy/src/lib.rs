//! Course Version Proxy – Issue #698 & Issue #1367
//!
//! Implements an upgradeable proxy using Soroban's native WASM-replacement
//! mechanism (UUPS pattern) with a mandatory 48-hour timelock queue.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
};

pub const TIMELOCK_DELAY: u64 = 172_800; // 48 hours in seconds

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CourseUpgradeProposal {
    pub wasm_hash: BytesN<32>,
    pub eta: u64,
    pub executed: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum CourseProxyKey {
    Admin,
    ImplWasm,
    CourseVersion,
    UpgradeProposal(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ProxyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    TimelockNotExpired = 4,
    ProposalNotFound = 5,
    ProposalExpired = 6,
}

#[contract]
pub struct CourseProxy;

#[contractimpl]
impl CourseProxy {
    /// Initialize with an admin and the initial implementation WASM hash.
    /// Also sets the course version to 1.
    pub fn init(env: Env, admin: Address, wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&CourseProxyKey::Admin) {
            panic_with_error!(&env, ProxyError::AlreadyInitialized);
        }
        env.storage().instance().set(&CourseProxyKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&CourseProxyKey::ImplWasm, &wasm_hash);
        env.storage()
            .instance()
            .set(&CourseProxyKey::CourseVersion, &1u32);
        // Upgrade WASM so the contract immediately executes implementation logic.
        #[cfg(not(test))]
        env.deployer().update_current_contract_wasm(wasm_hash);
    }

    /// Propose a course proxy WASM upgrade with a 48-hour timelock.
    pub fn propose_upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) -> u64 {
        caller.require_auth();
        Self::propose_upgrade_impl(&env, &caller, &new_wasm_hash)
    }

    /// Execute a queued course proxy WASM upgrade after timelock expiry.
    pub fn execute_upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        caller.require_auth();
        Self::execute_upgrade_impl(&env, &caller, &new_wasm_hash);
    }

    /// Upgrade to a new implementation WASM, enforcing the 48h timelock requirement.
    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let proposal_opt: Option<CourseUpgradeProposal> = env
            .storage()
            .instance()
            .get(&CourseProxyKey::UpgradeProposal(new_wasm_hash.clone()));

        match proposal_opt {
            None => {
                Self::propose_upgrade_impl(&env, &caller, &new_wasm_hash);
                panic_with_error!(&env, ProxyError::TimelockNotExpired);
            }
            Some(proposal) => {
                if env.ledger().timestamp() < proposal.eta {
                    panic_with_error!(&env, ProxyError::TimelockNotExpired);
                }
                Self::execute_upgrade_impl(&env, &caller, &new_wasm_hash);
            }
        }
    }

    /// Return the current upgrade proposal for a given WASM hash.
    pub fn get_proposal(env: Env, wasm_hash: BytesN<32>) -> Option<CourseUpgradeProposal> {
        env.storage()
            .instance()
            .get(&CourseProxyKey::UpgradeProposal(wasm_hash))
    }

    /// Return the current implementation WASM hash.
    pub fn get_impl(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&CourseProxyKey::ImplWasm)
            .unwrap_or_else(|| panic_with_error!(&env, ProxyError::NotInitialized))
    }

    /// Return the current course version number (increments on each upgrade).
    pub fn get_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&CourseProxyKey::CourseVersion)
            .unwrap_or(1)
    }

    /// Transfer admin rights to a new address.
    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&CourseProxyKey::Admin, &new_admin);
    }

    // -----------------------------------------------------------------------

    fn propose_upgrade_impl(env: &Env, caller: &Address, new_wasm_hash: &BytesN<32>) -> u64 {
        Self::assert_admin(env, caller);

        let eta = env.ledger().timestamp() + TIMELOCK_DELAY;
        let proposal = CourseUpgradeProposal {
            wasm_hash: new_wasm_hash.clone(),
            eta,
            executed: false,
        };

        env.storage().instance().set(
            &CourseProxyKey::UpgradeProposal(new_wasm_hash.clone()),
            &proposal,
        );

        eta
    }

    fn execute_upgrade_impl(env: &Env, caller: &Address, new_wasm_hash: &BytesN<32>) {
        Self::assert_admin(env, caller);

        let proposal_key = CourseProxyKey::UpgradeProposal(new_wasm_hash.clone());
        let mut proposal: CourseUpgradeProposal = env
            .storage()
            .instance()
            .get(&proposal_key)
            .unwrap_or_else(|| panic_with_error!(env, ProxyError::ProposalNotFound));

        if proposal.executed {
            panic_with_error!(env, ProxyError::ProposalExpired);
        }

        if env.ledger().timestamp() < proposal.eta {
            panic_with_error!(env, ProxyError::TimelockNotExpired);
        }

        proposal.executed = true;
        env.storage().instance().set(&proposal_key, &proposal);

        let version: u32 = env
            .storage()
            .instance()
            .get(&CourseProxyKey::CourseVersion)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&CourseProxyKey::CourseVersion, &(version + 1));

        env.storage()
            .instance()
            .set(&CourseProxyKey::ImplWasm, new_wasm_hash);

        #[cfg(not(test))]
        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&CourseProxyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, ProxyError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, ProxyError::Unauthorized);
        }
    }
}

#[cfg(test)]
mod tests;
