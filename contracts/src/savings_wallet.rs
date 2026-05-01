use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Address, Env, Vec, panic_with_error};

#[contracttype]
#[derive(Clone, Debug)]
pub struct SavingsAccount {
    pub owner: Address,
    pub balance: i128,
    pub lock_period: u64,
    pub created_at: u64,
    pub maturity_date: u64,
    pub interest_rate: u32,
    pub last_interest_claim: u64,
    pub total_interest_earned: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum SavingsDataKey {
    Account(Address),
    AccountList,
    NextAccountId,
    EarlyWithdrawalPenalty,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SavingsError {
    AccountNotFound = 1,
    InsufficientBalance = 2,
    AccountLocked = 3,
    InvalidAmount = 4,
    InvalidLockPeriod = 5,
    InvalidInterestRate = 6,
    AlreadyExists = 7,
}

const MIN_LOCK_PERIOD: u64 = 86400;
const MAX_LOCK_PERIOD: u64 = 31536000;
const DEFAULT_PENALTY_RATE: u32 = 1000;
const BASIS_POINTS: u32 = 10000;

#[contract]
pub struct SavingsWalletContract;

#[contractimpl]
impl SavingsWalletContract {
    pub fn initialize(env: Env, penalty_rate: u32) {
        if env.storage().instance().has(&SavingsDataKey::EarlyWithdrawalPenalty) {
            return;
        }
        
        env.storage().instance().set(&SavingsDataKey::EarlyWithdrawalPenalty, &penalty_rate);
        env.storage().instance().set(&SavingsDataKey::NextAccountId, &0u64);
        
        let empty_list: Vec<Address> = Vec::new(&env);
        env.storage().instance().set(&SavingsDataKey::AccountList, &empty_list);
    }

    pub fn create_savings(
        env: Env,
        owner: Address,
        amount: i128,
        lock_period: u64,
        interest_rate: u32,
    ) -> SavingsAccount {
        owner.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, SavingsError::InvalidAmount);
        }

        if lock_period < MIN_LOCK_PERIOD || lock_period > MAX_LOCK_PERIOD {
            panic_with_error!(&env, SavingsError::InvalidLockPeriod);
        }

        if interest_rate > BASIS_POINTS {
            panic_with_error!(&env, SavingsError::InvalidInterestRate);
        }

        if env.storage().instance().has(&SavingsDataKey::Account(owner.clone())) {
            panic_with_error!(&env, SavingsError::AlreadyExists);
        }

        let current_time = env.ledger().timestamp();
        let maturity_date = current_time.saturating_add(lock_period);

        let account = SavingsAccount {
            owner: owner.clone(),
            balance: amount,
            lock_period,
            created_at: current_time,
            maturity_date,
            interest_rate,
            last_interest_claim: current_time,
            total_interest_earned: 0,
        };

        env.storage().instance().set(&SavingsDataKey::Account(owner.clone()), &account);

        let mut account_list: Vec<Address> = env
            .storage()
            .instance()
            .get(&SavingsDataKey::AccountList)
            .unwrap_or_else(|| Vec::new(&env));
        account_list.push_back(owner.clone());
        env.storage().instance().set(&SavingsDataKey::AccountList, &account_list);

        env.events().publish(
            (soroban_sdk::symbol_short!("sav_creat"),),
            (owner.clone(), amount, lock_period, interest_rate),
        );

        account
    }

    pub fn deposit(env: Env, owner: Address, amount: i128) -> SavingsAccount {
        owner.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, SavingsError::InvalidAmount);
        }

        let mut account: SavingsAccount = env
            .storage()
            .instance()
            .get(&SavingsDataKey::Account(owner.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, SavingsError::AccountNotFound));

        account.balance = account.balance.saturating_add(amount);
        env.storage().instance().set(&SavingsDataKey::Account(owner.clone()), &account);

        env.events().publish(
            (soroban_sdk::symbol_short!("deposited"),),
            (owner.clone(), amount, account.balance),
        );

        account
    }

    pub fn withdraw_matured(env: Env, owner: Address, amount: i128) -> i128 {
        owner.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, SavingsError::InvalidAmount);
        }

        let mut account: SavingsAccount = env
            .storage()
            .instance()
            .get(&SavingsDataKey::Account(owner.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, SavingsError::AccountNotFound));

        let current_time = env.ledger().timestamp();
        if current_time < account.maturity_date {
            panic_with_error!(&env, SavingsError::AccountLocked);
        }

        if amount > account.balance {
            panic_with_error!(&env, SavingsError::InsufficientBalance);
        }

        account.balance = account.balance.saturating_sub(amount);
        env.storage().instance().set(&SavingsDataKey::Account(owner.clone()), &account);

        env.events().publish(
            (soroban_sdk::symbol_short!("withdrawn"),),
            (owner.clone(), amount, account.balance, 0i128),
        );

        amount
    }

    pub fn withdraw_early(env: Env, owner: Address, amount: i128) -> i128 {
        owner.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, SavingsError::InvalidAmount);
        }

        let mut account: SavingsAccount = env
            .storage()
            .instance()
            .get(&SavingsDataKey::Account(owner.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, SavingsError::AccountNotFound));

        if amount > account.balance {
            panic_with_error!(&env, SavingsError::InsufficientBalance);
        }

        let penalty_rate: u32 = env
            .storage()
            .instance()
            .get(&SavingsDataKey::EarlyWithdrawalPenalty)
            .unwrap_or(DEFAULT_PENALTY_RATE);

        let penalty = (amount as i128)
            .saturating_mul(penalty_rate as i128)
            .checked_div(BASIS_POINTS as i128)
            .unwrap_or(0);

        let net_amount = amount.saturating_sub(penalty);

        account.balance = account.balance.saturating_sub(amount);
        env.storage().instance().set(&SavingsDataKey::Account(owner.clone()), &account);

        env.events().publish(
            (soroban_sdk::symbol_short!("early_wd"),),
            (owner.clone(), amount, penalty, net_amount),
        );

        net_amount
    }

    pub fn get_account(env: Env, owner: Address) -> Option<SavingsAccount> {
        env.storage().instance().get(&SavingsDataKey::Account(owner))
    }

    pub fn get_all_accounts(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&SavingsDataKey::AccountList)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_penalty_rate(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&SavingsDataKey::EarlyWithdrawalPenalty)
            .unwrap_or(DEFAULT_PENALTY_RATE)
    }

    pub fn set_penalty_rate(env: Env, caller: Address, new_rate: u32) {
        caller.require_auth();
        
        if new_rate > BASIS_POINTS {
            panic_with_error!(&env, SavingsError::InvalidInterestRate);
        }

        env.storage().instance().set(&SavingsDataKey::EarlyWithdrawalPenalty, &new_rate);

        env.events().publish(
            (soroban_sdk::symbol_short!("pen_upd"),),
            (caller, new_rate),
        );
    }
}
