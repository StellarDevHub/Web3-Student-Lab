//! # Tokenized Reward Vesting Engine
//!
//! Provides customizable linear release schedules for grants, contributors, and compensations:
//! - Configurable cliff duration (zero tokens withdrawable before cliff matures)
//! - Accurate pro-rata unlocked calculation based on ledger sequence
//! - Revocable vs. irrevocable schedules with unvested tokens returning to organization treasury

use crate::VaultError;
use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSchedule {
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

impl VestingSchedule {
    pub fn new(
        id: u64,
        beneficiary: Address,
        total_amount: i128,
        start_ledger: u32,
        cliff_duration: u32,
        total_duration: u32,
        revocable: bool,
    ) -> Result<Self, VaultError> {
        if total_amount <= 0 {
            return Err(VaultError::ZeroAmount);
        }
        if total_duration == 0 || cliff_duration > total_duration {
            return Err(VaultError::InvalidThreshold);
        }
        let cliff_ledger = start_ledger
            .checked_add(cliff_duration)
            .ok_or(VaultError::Overflow)?;
        let end_ledger = start_ledger
            .checked_add(total_duration)
            .ok_or(VaultError::Overflow)?;

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

    /// Accurate pro-rata calculation of unlocked tokens at any given ledger sequence.
    /// Enforces cliff period: zero tokens withdrawable before cliff matures.
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

        (self.total_amount * elapsed) / duration
    }

    /// Claimable amount = vested_amount - claimed_amount
    pub fn claimable_amount(&self, current_ledger: u32) -> i128 {
        let vested = self.vested_amount(current_ledger);
        vested.saturating_sub(self.claimed_amount)
    }

    /// Claims unlocked tokens and updates claimed_amount
    pub fn claim(&mut self, current_ledger: u32) -> Result<i128, VaultError> {
        let claimable = self.claimable_amount(current_ledger);
        if claimable <= 0 {
            return Err(VaultError::ZeroAmount);
        }
        self.claimed_amount = self
            .claimed_amount
            .checked_add(claimable)
            .ok_or(VaultError::Overflow)?;
        Ok(claimable)
    }

    /// Revokes schedule: returns unvested tokens to organization treasury and locks total_amount.
    /// Returns (unvested_for_treasury, claimable_for_beneficiary).
    pub fn revoke(&mut self, current_ledger: u32) -> Result<(i128, i128), VaultError> {
        if !self.revocable {
            return Err(VaultError::Unauthorized);
        }
        if self.revoked {
            return Err(VaultError::AlreadyExecuted);
        }

        let vested = self.vested_amount(current_ledger);
        let unvested = self.total_amount.saturating_sub(vested);
        let claimable_for_beneficiary = vested.saturating_sub(self.claimed_amount);

        self.revoked = true;
        self.total_amount = vested; // Permanently caps total allocation to vested amount

        Ok((unvested, claimable_for_beneficiary))
    }
}
