//! Per-second borrow interest accrual (SC-007, spec key file).
//!
//! Interest compounds globally per token through a borrow index that starts
//! at [`crate::SCALE`] (`1e12`) and grows every time the pool is touched:
//!
//! ```text
//! Δindex = old_index × annual_rate_bps × elapsed_secs / (BPS × SECS_PER_YEAR)
//! ```
//!
//! The first-order (Taylor) approximation is exact for linear accrual and
//! error-bounded for the short windows between updates on Soroban ledgers.
//! User debt is then scaled from their index snapshot to the current global
//! index, giving real-time compounding between any two operations.

use crate::{BPS, SECS_PER_YEAR};

/// Grow the global borrow index by the interest accrued over `elapsed_secs`
/// at `annual_rate_bps`.
///
/// Returns `None` on arithmetic overflow (the caller maps this to a typed
/// `LPError`).
pub fn next_index(old_idx: i128, annual_rate_bps: i128, elapsed_secs: i128) -> Option<i128> {
    if old_idx <= 0 || annual_rate_bps <= 0 || elapsed_secs <= 0 {
        return Some(old_idx);
    }
    let denom = BPS.checked_mul(SECS_PER_YEAR)?;
    let delta = old_idx
        .checked_mul(annual_rate_bps)?
        .checked_mul(elapsed_secs)?
        .checked_div(denom)?;
    old_idx.checked_add(delta)
}

/// Scale a user's recorded principal from their `user_idx` snapshot to the
/// current `global_idx`, i.e. apply all interest accrued since the snapshot.
///
/// Returns `None` when no growth applies (zero principal, unchanged index,
/// or missing snapshot), so the caller leaves the stored debt untouched.
pub fn accrued_principal(principal: i128, global_idx: i128, user_idx: i128) -> Option<i128> {
    if principal <= 0 || user_idx <= 0 || global_idx <= user_idx {
        return None;
    }
    principal.checked_mul(global_idx)?.checked_div(user_idx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SCALE;

    #[test]
    fn next_index_grows_with_time_and_rate() {
        // 100 % annual rate for a full year: index must double.
        let idx = next_index(SCALE, 10_000, SECS_PER_YEAR).unwrap();
        assert_eq!(idx, SCALE * 2);

        // 10 % annual rate for a full year: index grows by 10 %.
        let idx = next_index(SCALE, 1_000, SECS_PER_YEAR).unwrap();
        assert_eq!(idx, SCALE + SCALE / 10);

        // One second at 10 %: delta = SCALE * 1000 * 1 / (10000 * 31536000).
        let idx = next_index(SCALE, 1_000, 1).unwrap();
        assert_eq!(idx, SCALE + 3_170);
    }

    #[test]
    fn next_index_identity_cases() {
        assert_eq!(next_index(SCALE, 1_000, 0), Some(SCALE));
        assert_eq!(next_index(SCALE, 0, 1_000), Some(SCALE));
        assert_eq!(next_index(SCALE, -5, 1_000), Some(SCALE));
    }

    #[test]
    fn accrued_principal_scales_debt() {
        // Debt snapshot at index 1e12; index has grown to 2e12 ⇒ debt doubles.
        assert_eq!(accrued_principal(1_000, SCALE * 2, SCALE), Some(2_000));

        // Unchanged index ⇒ no accrual (caller keeps stored debt).
        assert_eq!(accrued_principal(1_000, SCALE, SCALE), None);
        assert_eq!(accrued_principal(1_000, SCALE - 1, SCALE), None);

        // Zero principal or missing snapshot ⇒ no accrual.
        assert_eq!(accrued_principal(0, SCALE * 2, SCALE), None);
        assert_eq!(accrued_principal(1_000, SCALE * 2, 0), None);
    }
}
