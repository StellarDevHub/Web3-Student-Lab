use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, Symbol};

const KEY_SCHEDULE: Symbol = Symbol::new("schedule");
const KEY_LAST_BUYBACK: Symbol = Symbol::new("last_bb");
const KEY_TOTAL_BURNED: Symbol = Symbol::new("total_burned");
const KEY_REVENUE: Symbol = Symbol::new("revenue");

#[contracttype]
#[derive(Clone, Debug)]
pub struct BuybackSchedule {
    pub interval_seconds: u64,
    pub allocation_percentage: u32, // % of revenue to use for buyback
    pub enabled: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BuybackExecutedEvent {
    pub amount_burned: i128,
    pub revenue_used: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BurnConfigUpdatedEvent {
    pub old_percentage: u32,
    pub new_percentage: u32,
    pub timestamp: u64,
}

#[contract]
pub struct BurnMechanism;

#[contractimpl]
impl BurnMechanism {
    pub fn initialize(env: Env, burn_percentage: u32, buyback_interval: u64, allocation_pct: u32) {
        if env.storage().instance().has(&KEY_SCHEDULE) { panic!("Already initialized"); }
        env.storage().instance().set(&KEY_SCHEDULE, &BuybackSchedule {
            interval_seconds: buyback_interval,
            allocation_percentage: allocation_pct,
            enabled: true,
        });
        env.storage().instance().set(&KEY_LAST_BUYBACK, &0u64);
        env.storage().instance().set(&KEY_TOTAL_BURNED, &0i128);
        env.storage().instance().set(&KEY_REVENUE, &0i128);
    }

    /// Execute a buyback-and-burn using accumulated revenue
    pub fn execute_buyback(env: Env) -> i128 {
        let schedule: BuybackSchedule = env.storage().instance().get(&KEY_SCHEDULE).unwrap();
        if !schedule.enabled { return 0; }

        let last: u64 = env.storage().instance().get(&KEY_LAST_BUYBACK).unwrap_or(0);
        let now = env.ledger().timestamp();
        if now - last < schedule.interval_seconds { return 0; }

        let revenue: i128 = env.storage().instance().get(&KEY_REVENUE).unwrap_or(0);
        let buyback_amount = revenue * schedule.allocation_percentage as i128 / 100;

        if buyback_amount > 0 {
            env.storage().instance().set(&KEY_REVENUE, &(revenue - buyback_amount));

            let total_burned: i128 = env.storage().instance().get(&KEY_TOTAL_BURNED).unwrap_or(0);
            env.storage().instance().set(&KEY_TOTAL_BURNED, &(total_burned + buyback_amount));
            env.storage().instance().set(&KEY_LAST_BUYBACK, &now);

            env.events().publish((Symbol::new(&env, "buyback_executed"),), BuybackExecutedEvent {
                amount_burned: buyback_amount, revenue_used: buyback_amount,
                timestamp: now,
            });

            return buyback_amount;
        }
        0
    }

    /// Add revenue for future buybacks
    pub fn add_revenue(env: Env, amount: i128) {
        let revenue: i128 = env.storage().instance().get(&KEY_REVENUE).unwrap_or(0);
        env.storage().instance().set(&KEY_REVENUE, &(revenue + amount));
    }

    /// Update burn percentage
    pub fn update_burn_percentage(env: Env, new_pct: u32) {
        if new_pct > 1000 { panic!("Burn % max 10% (1000 bps)"); }
        let schedule: BuybackSchedule = env.storage().instance().get(&KEY_SCHEDULE).unwrap();
        let old_pct = schedule.allocation_percentage;

        let mut updated = schedule;
        updated.allocation_percentage = new_pct;
        env.storage().instance().set(&KEY_SCHEDULE, &updated);

        env.events().publish((Symbol::new(&env, "burn_config_updated"),), BurnConfigUpdatedEvent {
            old_percentage: old_pct, new_percentage: new_pct,
            timestamp: env.ledger().timestamp(),
        });
    }

    pub fn get_total_burned(env: Env) -> i128 {
        env.storage().instance().get(&KEY_TOTAL_BURNED).unwrap_or(0)
    }

    pub fn get_revenue(env: Env) -> i128 {
        env.storage().instance().get(&KEY_REVENUE).unwrap_or(0)
    }

    pub fn get_schedule(env: Env) -> BuybackSchedule {
        env.storage().instance().get(&KEY_SCHEDULE).unwrap_or(BuybackSchedule {
            interval_seconds: 0, allocation_percentage: 0, enabled: false,
        })
    }
}
