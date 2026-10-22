//! Third-party liquidation engine math (SC-007, spec key file).
//!
//! A liquidator repays part of an underwater borrower's debt in debt-token
//! units and seizes collateral worth the repaid value **plus** the configured
//! liquidation discount bonus:
//!
//! ```text
//! seize = repay × debt_price × (BPS + bonus_bps) / (coll_price × BPS)
//! ```
//!
//! With equal prices an 8 % bonus (`800` bps) yields `seize = repay × 1.08`,
//! so the liquidator is always incentivised to act.

use crate::BPS;

/// Collateral seized for repaying `repay` of debt, including the liquidator's
/// `liq_bonus_bps` discount bonus.
///
/// Returns `None` on invalid inputs (non-positive amounts or prices) or
/// arithmetic overflow; the caller maps this to a typed `LPError`.
pub fn seize_amount(
    repay: i128,
    debt_price: i128,
    coll_price: i128,
    liq_bonus_bps: i128,
) -> Option<i128> {
    if repay <= 0 || debt_price <= 0 || coll_price <= 0 || liq_bonus_bps < 0 {
        return None;
    }
    let bps_plus_bonus = BPS.checked_add(liq_bonus_bps)?;
    let numerator = repay.checked_mul(debt_price)?.checked_mul(bps_plus_bonus)?;
    let denominator = coll_price.checked_mul(BPS)?;
    numerator.checked_div(denominator)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eight_percent_discount_seizes_1_08x() {
        // Equal prices, 8 % bonus: 1_000 repaid ⇒ 1_080 seized.
        assert_eq!(seize_amount(1_000, 1, 1, 800), Some(1_080));
        assert_eq!(seize_amount(10_000, 1, 1, 800), Some(10_800));
    }

    #[test]
    fn discount_scales_with_price_ratio() {
        // Debt is worth 2× collateral: same bonus, double the units seized.
        assert_eq!(seize_amount(1_000, 2, 1, 800), Some(2_160));
        // Collateral worth 2× debt: half the units seized.
        assert_eq!(seize_amount(1_000, 1, 2, 800), Some(540));
    }

    #[test]
    fn zero_bonus_represents_plain_repayment() {
        assert_eq!(seize_amount(1_000, 1, 1, 0), Some(1_000));
    }

    #[test]
    fn invalid_inputs_return_none() {
        assert_eq!(seize_amount(0, 1, 1, 800), None);
        assert_eq!(seize_amount(-1, 1, 1, 800), None);
        assert_eq!(seize_amount(1_000, 0, 1, 800), None);
        assert_eq!(seize_amount(1_000, 1, 0, 800), None);
        assert_eq!(seize_amount(1_000, 1, 1, -1), None);
    }
}
