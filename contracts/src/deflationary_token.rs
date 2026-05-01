use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, Symbol};

const KEY_TOTAL_SUPPLY: Symbol = Symbol::new("total_supply");
const KEY_BURN_PERCENTAGE: Symbol = Symbol::new("burn_pct");
const KEY_BURN_HISTORY: Symbol = Symbol::new("burn_hist");
const KEY_BALANCES: Symbol = Symbol::new("balances");

#[contracttype]
#[derive(Clone, Debug)]
pub struct BurnRecord {
    pub from: Address,
    pub amount: i128,
    pub burn_type: Symbol,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TokenBurnedEvent {
    pub from: Address,
    pub amount: i128,
    pub new_total_supply: i128,
    pub burn_type: Symbol,
    pub timestamp: u64,
}

#[contract]
pub struct DeflationaryToken;

#[contractimpl]
impl DeflationaryToken {
    pub fn initialize(env: Env, initial_supply: i128, burn_percentage: u32) {
        if env.storage().instance().has(&KEY_TOTAL_SUPPLY) { panic!("Already initialized"); }
        if burn_percentage > 1000 { panic!("Burn % max 10% (1000 bps)"); }
        env.storage().instance().set(&KEY_TOTAL_SUPPLY, &initial_supply);
        env.storage().instance().set(&KEY_BURN_PERCENTAGE, &burn_percentage);
        env.storage().instance().set(&KEY_BURN_HISTORY, &Map::<u64, BurnRecord>::new(&env));
        env.storage().instance().set(&KEY_BALANCES, &Map::<Address, i128>::new(&env));
    }

    /// Transfer with automatic burn
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let mut balances: Map<Address, i128> = env.storage().instance().get(&KEY_BALANCES).unwrap();
        let from_balance = balances.get(from.clone()).unwrap_or(0);
        if from_balance < amount { panic!("Insufficient balance"); }

        let burn_pct: u32 = env.storage().instance().get(&KEY_BURN_PERCENTAGE).unwrap_or(0);
        let burn_amount = amount * burn_pct as i128 / 10000i128;
        let transfer_amount = amount - burn_amount;

        balances.set(from.clone(), from_balance - amount);
        let to_balance = balances.get(to.clone()).unwrap_or(0);
        balances.set(to.clone(), to_balance + transfer_amount);
        env.storage().instance().set(&KEY_BALANCES, &balances);

        if burn_amount > 0 {
            let total_supply: i128 = env.storage().instance().get(&KEY_TOTAL_SUPPLY).unwrap_or(0);
            let new_supply = total_supply - burn_amount;
            env.storage().instance().set(&KEY_TOTAL_SUPPLY, &new_supply);

            let mut history: Map<u64, BurnRecord> = env.storage().instance().get(&KEY_BURN_HISTORY).unwrap();
            let next_id = history.len() as u64;
            history.set(next_id, BurnRecord {
                from: from.clone(), amount: burn_amount,
                burn_type: Symbol::new(&env, "transfer"),
                timestamp: env.ledger().timestamp(),
            });
            env.storage().instance().set(&KEY_BURN_HISTORY, &history);

            env.events().publish((Symbol::new(&env, "token_burned"),), TokenBurnedEvent {
                from, amount: burn_amount, new_total_supply: new_supply,
                burn_type: Symbol::new(&env, "transfer"),
                timestamp: env.ledger().timestamp(),
            });
        }
    }

    /// Mint new tokens (increases supply)
    pub fn mint(env: Env, to: Address, amount: i128) {
        let mut balances: Map<Address, i128> = env.storage().instance().get(&KEY_BALANCES).unwrap();
        let current = balances.get(to.clone()).unwrap_or(0);
        balances.set(to, current + amount);
        env.storage().instance().set(&KEY_BALANCES, &balances);

        let total_supply: i128 = env.storage().instance().get(&KEY_TOTAL_SUPPLY).unwrap_or(0);
        env.storage().instance().set(&KEY_TOTAL_SUPPLY, &(total_supply + amount));
    }

    /// Buyback and burn — burn tokens directly
    pub fn buyback_and_burn(env: Env, amount: i128) {
        let total_supply: i128 = env.storage().instance().get(&KEY_TOTAL_SUPPLY).unwrap_or(0);
        let new_supply = total_supply - amount;
        env.storage().instance().set(&KEY_TOTAL_SUPPLY, &new_supply);

        let mut history: Map<u64, BurnRecord> = env.storage().instance().get(&KEY_BURN_HISTORY).unwrap();
        let next_id = history.len() as u64;
        history.set(next_id, BurnRecord {
            from: env.current_contract_address(),
            amount, burn_type: Symbol::new(&env, "buyback"),
            timestamp: env.ledger().timestamp(),
        });
        env.storage().instance().set(&KEY_BURN_HISTORY, &history);

        env.events().publish((Symbol::new(&env, "token_burned"),), TokenBurnedEvent {
            from: env.current_contract_address(), amount, new_total_supply: new_supply,
            burn_type: Symbol::new(&env, "buyback"),
            timestamp: env.ledger().timestamp(),
        });
    }

    pub fn get_total_supply(env: Env) -> i128 {
        env.storage().instance().get(&KEY_TOTAL_SUPPLY).unwrap_or(0)
    }

    pub fn get_burn_percentage(env: Env) -> u32 {
        env.storage().instance().get(&KEY_BURN_PERCENTAGE).unwrap_or(0)
    }

    pub fn get_balance(env: Env, owner: Address) -> i128 {
        let balances: Map<Address, i128> = env.storage().instance().get(&KEY_BALANCES).unwrap();
        balances.get(owner).unwrap_or(0)
    }

    pub fn get_burn_history(env: Env) -> Map<u64, BurnRecord> {
        env.storage().instance().get(&KEY_BURN_HISTORY).unwrap_or(Map::new(&env))
    }
}
