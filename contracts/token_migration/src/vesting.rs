//! # Token Migration Reward Vesting
//!
//! Provides linear token vesting for migrated balances, educator incentives,
//! and team grants with cliff enforcement and revocable schedules.

use crate::MigError;
use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationVestingSchedule {
    pub id: u64,
    pub beneficiary: Address,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_ledger: u32,
    pub cliff_ledger: u32,
    pub end_ledger: u32,
    pub revocable: bool,
    pub revoked: bool,
}

impl MigrationVestingSchedule {
    pub fn new(
        id: u64,
        beneficiary: Address,
        total_amount: i128,
        start_ledger: u32,
        cliff_duration: u32,
        total_duration: u32,
        revocable: bool,
    ) -> Result<Self, MigError> {
        if total_amount <= 0 {
            return Err(MigError::ZeroAmount);
        }
        if total_duration == 0 || cliff_duration > total_duration {
            return Err(MigError::ZeroAmount);
        }
        let cliff_ledger = start_ledger
            .checked_add(cliff_duration)
            .ok_or(MigError::Overflow)?;
        let end_ledger = start_ledger
            .checked_add(total_duration)
            .ok_or(MigError::Overflow)?;

        Ok(Self {
            id,
            beneficiary,
            total_amount,
            claimed_amount: 0,
            start_ledger,
            cliff_ledger,
            end_ledger,
            revocable,
            revoked: false,
        })
    }

    /// Computes pro-rata unlocked tokens at current ledger sequence.
    /// Strictly enforces cliff: zero tokens withdrawable before cliff matures.
    pub fn vested_amount(&self, current_ledger: u32) -> i128 {
        if self.revoked {
            return self.total_amount;
        }
        if current_ledger < self.cliff_ledger {
            return 0;
        }
        if current_ledger >= self.end_ledger {
            return self.total_amount;
        }

        let elapsed = (current_ledger - self.start_ledger) as i128;
        let duration = (self.end_ledger - self.start_ledger) as i128;

        let whole = (self.total_amount / duration) * elapsed;
        let remainder = (self.total_amount % duration) * elapsed / duration;
        whole + remainder
    }

    /// Claimable amount = vested_amount - claimed_amount
    pub fn claimable_amount(&self, current_ledger: u32) -> i128 {
        let vested = self.vested_amount(current_ledger);
        vested.saturating_sub(self.claimed_amount)
    }

    /// Claims unlocked tokens.
    pub fn claim(&mut self, current_ledger: u32) -> Result<i128, MigError> {
        let claimable = self.claimable_amount(current_ledger);
        if claimable <= 0 {
            return Err(MigError::ZeroAmount);
        }
        self.claimed_amount = self
            .claimed_amount
            .checked_add(claimable)
            .ok_or(MigError::Overflow)?;
        Ok(claimable)
    }

    /// Revokes schedule: unvested tokens returned to treasury, total allocation capped.
    /// Returns (unvested_for_treasury, claimable_for_beneficiary).
    pub fn revoke(&mut self, current_ledger: u32) -> Result<(i128, i128), MigError> {
        if !self.revocable {
            return Err(MigError::Unauthorized);
        }
        if self.revoked {
            return Err(MigError::DeadlineNotReached);
        }

        let vested = self.vested_amount(current_ledger);
        let unvested = self.total_amount.saturating_sub(vested);
        let claimable_for_beneficiary = vested.saturating_sub(self.claimed_amount);

        self.revoked = true;
        self.total_amount = vested;

        Ok((unvested, claimable_for_beneficiary))
    }
}
