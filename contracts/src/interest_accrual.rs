use soroban_sdk::{contracttype, Address, Env, panic_with_error};
use crate::savings_wallet::{SavingsAccount, SavingsDataKey, SavingsError};

const SECONDS_PER_YEAR: u64 = 31536000;
const BASIS_POINTS: u32 = 10000;

#[contracttype]
#[derive(Clone, Debug)]
pub struct InterestCalculation {
    pub principal: i128,
    pub interest_earned: i128,
    pub time_elapsed: u64,
    pub effective_rate: u32,
}

pub struct InterestAccrualService;

impl InterestAccrualService {
    pub fn calculate_accrued_interest(
        env: &Env,
        account: &SavingsAccount,
    ) -> InterestCalculation {
        let current_time = env.ledger().timestamp();
        let time_elapsed = current_time.saturating_sub(account.last_interest_claim);

        if time_elapsed == 0 {
            return InterestCalculation {
                principal: account.balance,
                interest_earned: 0,
                time_elapsed: 0,
                effective_rate: account.interest_rate,
            };
        }

        let interest = Self::compound_interest(
            account.balance,
            account.interest_rate,
            time_elapsed,
        );

        InterestCalculation {
            principal: account.balance,
            interest_earned: interest,
            time_elapsed,
            effective_rate: account.interest_rate,
        }
    }

    pub fn compound_interest(principal: i128, annual_rate: u32, time_seconds: u64) -> i128 {
        if principal <= 0 || annual_rate == 0 || time_seconds == 0 {
            return 0;
        }

        let rate_per_second = (annual_rate as i128)
            .checked_div(SECONDS_PER_YEAR as i128)
            .unwrap_or(0);

        let interest = principal
            .saturating_mul(rate_per_second)
            .saturating_mul(time_seconds as i128)
            .checked_div(BASIS_POINTS as i128)
            .unwrap_or(0);

        interest
    }

    pub fn claim_interest(env: &Env, owner: &Address) -> i128 {
        let mut account: SavingsAccount = env
            .storage()
            .instance()
            .get(&SavingsDataKey::Account(owner.clone()))
            .unwrap_or_else(|| panic_with_error!(env, SavingsError::AccountNotFound));

        let calculation = Self::calculate_accrued_interest(env, &account);
        
        if calculation.interest_earned <= 0 {
            return 0;
        }

        account.balance = account.balance.saturating_add(calculation.interest_earned);
        account.total_interest_earned = account.total_interest_earned.saturating_add(calculation.interest_earned);
        account.last_interest_claim = env.ledger().timestamp();

        env.storage().instance().set(&SavingsDataKey::Account(owner.clone()), &account);

        env.events().publish(
            (soroban_sdk::symbol_short!("int_claim"),),
            (owner.clone(), calculation.interest_earned, account.balance),
        );

        calculation.interest_earned
    }

    pub fn get_pending_interest(env: &Env, owner: &Address) -> i128 {
        let account: SavingsAccount = env
            .storage()
            .instance()
            .get(&SavingsDataKey::Account(owner.clone()))
            .unwrap_or_else(|| panic_with_error!(env, SavingsError::AccountNotFound));

        let calculation = Self::calculate_accrued_interest(env, &account);
        calculation.interest_earned
    }

    pub fn get_projected_interest(
        env: &Env,
        owner: &Address,
        future_seconds: u64,
    ) -> i128 {
        let account: SavingsAccount = env
            .storage()
            .instance()
            .get(&SavingsDataKey::Account(owner.clone()))
            .unwrap_or_else(|| panic_with_error!(env, SavingsError::AccountNotFound));

        let current_calculation = Self::calculate_accrued_interest(env, &account);
        let future_balance = account.balance.saturating_add(current_calculation.interest_earned);

        Self::compound_interest(future_balance, account.interest_rate, future_seconds)
    }

    pub fn get_apy(annual_rate: u32) -> u32 {
        annual_rate
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compound_interest_calculation() {
        let principal = 1000_0000000i128;
        let annual_rate = 500u32;
        let time_seconds = 31536000u64;

        let interest = InterestAccrualService::compound_interest(principal, annual_rate, time_seconds);
        
        assert!(interest > 0);
        assert!(interest <= principal.saturating_mul(annual_rate as i128).checked_div(BASIS_POINTS as i128).unwrap_or(0));
    }

    #[test]
    fn test_zero_principal() {
        let interest = InterestAccrualService::compound_interest(0, 500, 31536000);
        assert_eq!(interest, 0);
    }

    #[test]
    fn test_zero_rate() {
        let interest = InterestAccrualService::compound_interest(1000_0000000, 0, 31536000);
        assert_eq!(interest, 0);
    }

    #[test]
    fn test_zero_time() {
        let interest = InterestAccrualService::compound_interest(1000_0000000, 500, 0);
        assert_eq!(interest, 0);
    }
}
