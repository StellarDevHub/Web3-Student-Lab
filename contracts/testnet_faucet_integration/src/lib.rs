#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AmountExceedsLimit = 1,
    RequestTooSoon = 2,
    ProjectNotFound = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FaucetRequest {
    pub user: Address,
    pub amount: i128,
    pub timestamp: u64,
    pub project_id: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectIdea {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub creator: Address,
    pub required_tokens: i128,
    pub created_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    TokenAddress,
    RequestCounter,
    ProjectCounter,
    FaucetRequest(u64),
    ProjectIdea(u64),
    UserLastRequest(Address),
    DailyLimit,
    RequestLimit,
}

#[contract]
pub struct TestnetFaucetIntegration;

const DAY_IN_SECONDS: u64 = 86400;
const DEFAULT_DAILY_LIMIT: i128 = 10000_0000000; // 10000 tokens with 7 decimals
const DEFAULT_REQUEST_LIMIT: i128 = 1000_0000000; // 1000 tokens per request

#[contractimpl]
impl TestnetFaucetIntegration {
    /// Initialize the faucet with admin and token address
    pub fn initialize(env: Env, admin: Address, token_address: Address) {
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::TokenAddress, &token_address);
        env.storage()
            .instance()
            .set(&DataKey::DailyLimit, &DEFAULT_DAILY_LIMIT);
        env.storage()
            .instance()
            .set(&DataKey::RequestLimit, &DEFAULT_REQUEST_LIMIT);
        env.storage()
            .instance()
            .set(&DataKey::RequestCounter, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::ProjectCounter, &0u64);
    }

    /// Request testnet tokens for a hackathon project
    pub fn request_tokens(
        env: Env,
        user: Address,
        amount: i128,
        project_id: u64,
    ) -> Result<(), Error> {
        user.require_auth();

        // Validate amount
        let request_limit: i128 = env
            .storage()
            .instance()
            .get(&DataKey::RequestLimit)
            .unwrap();
        if amount > request_limit {
            return Err(Error::AmountExceedsLimit);
        }

        // Check daily limit
        let last_request_key = DataKey::UserLastRequest(user.clone());
        if let Some(last_request_time) = env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&last_request_key)
        {
            let current_time = env.ledger().timestamp();
            if current_time - last_request_time < DAY_IN_SECONDS {
                return Err(Error::RequestTooSoon);
            }
        }

        // Verify project exists
        let project_key = DataKey::ProjectIdea(project_id);
        if !env.storage().persistent().has(&project_key) {
            return Err(Error::ProjectNotFound);
        }

        // Create faucet request
        let request_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::RequestCounter)
            .unwrap();
        let request = FaucetRequest {
            user: user.clone(),
            amount,
            timestamp: env.ledger().timestamp(),
            project_id,
        };

        env.storage()
            .persistent()
            .set(&DataKey::FaucetRequest(request_id), &request);
        env.storage()
            .persistent()
            .set(&last_request_key, &env.ledger().timestamp());
        env.storage()
            .instance()
            .set(&DataKey::RequestCounter, &(request_id + 1));

        // Transfer tokens
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &user, &amount);

        // Emit event
        env.events().publish(
            (String::from_str(&env, "faucet_req"),),
            (request_id, user, amount),
        );

        Ok(())
    }

    /// Create a new hackathon project idea
    pub fn create_project(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        required_tokens: i128,
    ) -> u64 {
        creator.require_auth();

        let project_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProjectCounter)
            .unwrap();

        let project = ProjectIdea {
            id: project_id,
            title,
            description,
            creator: creator.clone(),
            required_tokens,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::ProjectIdea(project_id), &project);
        env.storage()
            .instance()
            .set(&DataKey::ProjectCounter, &(project_id + 1));

        env.events().publish(
            (String::from_str(&env, "project_created"),),
            (project_id, creator),
        );

        project_id
    }

    /// Get project details
    pub fn get_project(env: Env, project_id: u64) -> Option<ProjectIdea> {
        env.storage()
            .persistent()
            .get(&DataKey::ProjectIdea(project_id))
    }

    /// List all projects
    pub fn list_projects(env: Env) -> Vec<u64> {
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProjectCounter)
            .unwrap_or(0);
        let mut projects = Vec::new(&env);

        for i in 0..count {
            if env.storage().persistent().has(&DataKey::ProjectIdea(i)) {
                projects.push_back(i);
            }
        }

        projects
    }

    /// Get faucet request details
    pub fn get_request(env: Env, request_id: u64) -> Option<FaucetRequest> {
        env.storage()
            .persistent()
            .get(&DataKey::FaucetRequest(request_id))
    }

    /// Check if user can request tokens
    pub fn can_request(env: Env, user: Address) -> bool {
        let last_request_key = DataKey::UserLastRequest(user);

        if let Some(last_request_time) = env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&last_request_key)
        {
            let current_time = env.ledger().timestamp();
            current_time - last_request_time >= DAY_IN_SECONDS
        } else {
            true
        }
    }

    /// Admin: Update daily limit
    pub fn set_daily_limit(env: Env, new_limit: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::DailyLimit, &new_limit);
    }

    /// Admin: Update request limit
    pub fn set_request_limit(env: Env, new_limit: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::RequestLimit, &new_limit);
    }

    /// Admin: Fund faucet
    pub fn fund_faucet(env: Env, funder: Address, amount: i128) {
        funder.require_auth();

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        env.events()
            .publish((String::from_str(&env, "funded"),), (funder, amount));
    }

    /// Get faucet balance
    pub fn get_balance(env: Env) -> i128 {
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.balance(&env.current_contract_address())
    }

    /// Get token address
    pub fn get_token_address(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .unwrap()
    }

    /// Get request limit
    pub fn get_request_limit(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::RequestLimit)
            .unwrap()
    }
}

#[cfg(test)]
mod test;
