use crate::FP;

const BPS: i128 = 10_000;

pub(crate) fn curve_cost(supply: i128, amount: i128, base: i128, slope: i128) -> Option<i128> {
    if supply < 0 || amount <= 0 || base <= 0 || slope <= 0 {
        return None;
    }

    let linear = base.checked_mul(amount)?.checked_mul(2)?;
    let supply_term = supply.checked_mul(2)?.checked_add(amount)?;
    let polynomial = slope.checked_mul(amount)?.checked_mul(supply_term)?;
    let numerator = linear.checked_add(polynomial)?;
    let denominator = 2 * FP;
    let quotient = numerator / denominator;
    quotient.checked_add(if numerator % denominator == 0 { 0 } else { 1 })
}

pub(crate) fn curve_payout(supply: i128, amount: i128, base: i128, slope: i128) -> Option<i128> {
    if supply < amount || amount <= 0 || base <= 0 || slope <= 0 {
        return None;
    }

    let linear = base.checked_mul(amount)?.checked_mul(2)?;
    let supply_term = supply.checked_mul(2)?.checked_sub(amount)?;
    let polynomial = slope.checked_mul(amount)?.checked_mul(supply_term)?;
    let numerator = linear.checked_add(polynomial)?;
    Some(numerator / (2 * FP))
}

pub(crate) fn apply_buy_fee(cost: i128, fee_bps: i128) -> Option<(i128, i128)> {
    if cost < 0 || !(0..=1_000).contains(&fee_bps) {
        return None;
    }
    let fee_numerator = cost.checked_mul(fee_bps)?;
    let fee = fee_numerator / BPS + if fee_numerator % BPS == 0 { 0 } else { 1 };
    Some((cost.checked_add(fee)?, fee))
}

pub(crate) fn apply_sell_fee(payout: i128, fee_bps: i128) -> Option<(i128, i128)> {
    if payout < 0 || !(0..=1_000).contains(&fee_bps) {
        return None;
    }
    let fee_numerator = payout.checked_mul(fee_bps)?;
    let fee = fee_numerator / BPS + if fee_numerator % BPS == 0 { 0 } else { 1 };
    Some((payout.checked_sub(fee)?, fee))
}

pub(crate) fn solve_tokens_for_reserve(
    supply: i128,
    reserve_in: i128,
    base: i128,
    slope: i128,
    fee_bps: i128,
) -> Option<i128> {
    if reserve_in <= 0 {
        return Some(0);
    }

    let mut lo = 0i128;
    let mut hi = 1i128;
    loop {
        let affordable = curve_cost(supply, hi, base, slope)
            .and_then(|cost| apply_buy_fee(cost, fee_bps))
            .map(|(total, _)| total <= reserve_in)
            .unwrap_or(false);
        if !affordable {
            break;
        }
        lo = hi;
        if hi == i128::MAX {
            return Some(lo);
        }
        hi = hi.checked_mul(2).unwrap_or(i128::MAX);
    }

    while hi - lo > 1 {
        let mid = lo + (hi - lo) / 2;
        let affordable = curve_cost(supply, mid, base, slope)
            .and_then(|cost| apply_buy_fee(cost, fee_bps))
            .map(|(total, _)| total <= reserve_in)
            .unwrap_or(false);
        if affordable {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    Some(lo)
}
