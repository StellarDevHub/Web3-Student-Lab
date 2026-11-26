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

/// Minimum liquidation bonus in basis points (500 BPS = 5.0%).
pub const MIN_LIQ_BONUS_BPS: i128 = 500;
/// Maximum liquidation bonus in basis points (1,500 BPS = 15.0%).
pub const MAX_LIQ_BONUS_BPS: i128 = 1_500;

/// Calculates the dynamic liquidation bonus in basis points (BPS) as a function of health factor.
///
/// As health factor drops below 1.0 (represented as `BPS` = 10_000), the liquidation bonus
/// scales dynamically along a linear bonding curve from 5% (500 BPS) up to 15% (1,500 BPS)
/// to accelerate liquidation and protect protocol solvency.
///
/// - When `hf_bps >= BPS` (HF >= 1.0), returns `MIN_LIQ_BONUS_BPS` (5%).
/// - When `hf_bps <= 0` (collateral value is 0 or underwater), returns `MAX_LIQ_BONUS_BPS` (15%).
/// - Between 0 and 1.0, scales dynamically:
///   `bonus = MIN_LIQ_BONUS_BPS + (MAX_LIQ_BONUS_BPS - MIN_LIQ_BONUS_BPS) * (BPS - hf_bps) / BPS`
pub fn dynamic_liquidation_bonus(hf_bps: i128) -> i128 {
    dynamic_liquidation_bonus_range(hf_bps, MIN_LIQ_BONUS_BPS, MAX_LIQ_BONUS_BPS)
}

/// Calculates dynamic liquidation bonus for arbitrary min/max bounds.
pub fn dynamic_liquidation_bonus_range(
    hf_bps: i128,
    min_bonus_bps: i128,
    max_bonus_bps: i128,
) -> i128 {
    if hf_bps >= BPS {
        return min_bonus_bps;
    }
    if hf_bps <= 0 {
        return max_bonus_bps;
    }
    let bonus_range = max_bonus_bps.saturating_sub(min_bonus_bps);
    let deficit = BPS - hf_bps;
    let scaled = (bonus_range * deficit) / BPS;
    min_bonus_bps.saturating_add(scaled)
}

/// Collateral seized for repaying `repay` of debt, computing the dynamic liquidation
/// discount bonus based on borrower's health factor in BPS (`hf_bps`).
pub fn dynamic_seize_amount(
    repay: i128,
    debt_price: i128,
    coll_price: i128,
    hf_bps: i128,
) -> Option<i128> {
    let bonus_bps = dynamic_liquidation_bonus(hf_bps);
    seize_amount(repay, debt_price, coll_price, bonus_bps)
}

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
    fn dynamic_bonus_at_or_above_one_returns_min_bonus() {
        assert_eq!(dynamic_liquidation_bonus(10_000), 500); // HF = 1.0 -> 5%
        assert_eq!(dynamic_liquidation_bonus(15_000), 500); // HF = 1.5 -> 5%
    }

    #[test]
    fn dynamic_bonus_at_zero_or_negative_returns_max_bonus() {
        assert_eq!(dynamic_liquidation_bonus(0), 1_500); // HF = 0.0 -> 15%
        assert_eq!(dynamic_liquidation_bonus(-100), 1_500);
    }

    #[test]
    fn dynamic_bonus_scales_linearly_between_bounds() {
        // HF = 0.5 (5_000 BPS) -> 500 + 1_000 * 5_000 / 10_000 = 1_000 (10%)
        assert_eq!(dynamic_liquidation_bonus(5_000), 1_000);
        // HF = 0.25 (2_500 BPS) -> 500 + 1_000 * 7_500 / 10_000 = 1_250 (12.5%)
        assert_eq!(dynamic_liquidation_bonus(2_500), 1_250);
        // HF = 0.75 (7_500 BPS) -> 500 + 1_000 * 2_500 / 10_000 = 750 (7.5%)
        assert_eq!(dynamic_liquidation_bonus(7_500), 750);
    }

    #[test]
    fn dynamic_seize_amount_increases_as_health_factor_drops() {
        let repay = 1_000;
        let debt_price = 1;
        let coll_price = 1;

        // HF = 1.0 -> 5% bonus -> 1_050 seized
        let seize_hf1 = dynamic_seize_amount(repay, debt_price, coll_price, 10_000).unwrap();
        assert_eq!(seize_hf1, 1_050);

        // HF = 0.5 -> 10% bonus -> 1_100 seized
        let seize_hf05 = dynamic_seize_amount(repay, debt_price, coll_price, 5_000).unwrap();
        assert_eq!(seize_hf05, 1_100);

        // HF = 0.0 -> 15% bonus -> 1_150 seized
        let seize_hf0 = dynamic_seize_amount(repay, debt_price, coll_price, 0).unwrap();
        assert_eq!(seize_hf0, 1_150);

        assert!(seize_hf0 > seize_hf05);
        assert!(seize_hf05 > seize_hf1);
    }

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
