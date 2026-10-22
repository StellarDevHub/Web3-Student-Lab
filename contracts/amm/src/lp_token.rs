//! LP share (pool token) mint and burn math for the constant-product AMM.
//!
//! Keeping this math in one module makes the "no dilution" property
//! directly testable: every share is minted against the pool's pre-deposit
//! reserves using the smaller of the two reserve ratios, so an existing
//! LP's claim on the pool can never decrease when a new LP deposits.

/// Dead shares permanently burned on pool initialization to prevent
/// share-inflation attacks (attacker donates dust to skew the ratio).
pub const DEAD_SHARES: i128 = 1_000;

/// Integer square root (Babylonian method). `isqrt(n)` = floor(sqrt(n)).
pub fn isqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Shares minted for the initial deposit: `sqrt(amount_a * amount_b)` minus
/// the permanently locked `DEAD_SHARES`.
///
/// Returns `None` when the deposit is too small to cover the dead shares,
/// so the caller can reject it instead of minting an inflated position.
pub fn initial_shares(amount_a: i128, amount_b: i128) -> Option<i128> {
    if amount_a <= 0 || amount_b <= 0 {
        return None;
    }
    let gross = isqrt(amount_a * amount_b);
    if gross <= DEAD_SHARES {
        None
    } else {
        Some(gross - DEAD_SHARES)
    }
}

/// Shares minted for a subsequent deposit, proportional to the **smaller**
/// of the two reserve ratios. Using the minimum guarantees the deposit never
/// mints more shares than the pool's reserves support, so existing LP shares
/// are never diluted.
///
/// Returns `None` when the pool reserves or total share supply are unusable.
pub fn deposit_shares(
    amount_a: i128,
    amount_b: i128,
    balance_a: i128,
    balance_b: i128,
    total_shares: i128,
) -> Option<i128> {
    if amount_a <= 0 || amount_b <= 0 || balance_a <= 0 || balance_b <= 0 || total_shares <= 0 {
        return None;
    }
    let shares_from_a = (amount_a * total_shares) / balance_a;
    let shares_from_b = (amount_b * total_shares) / balance_b;
    Some(if shares_from_a < shares_from_b {
        shares_from_a
    } else {
        shares_from_b
    })
}

/// Token amounts returned when burning `shares`, pro-rata to the pool's
/// current reserves. Burning is the exact inverse of minting: redeeming
/// every share returns the entire pool (modulo integer rounding down).
///
/// Returns `None` when the inputs cannot produce a meaningful withdrawal.
pub fn withdrawal_amounts(
    shares: i128,
    balance_a: i128,
    balance_b: i128,
    total_shares: i128,
) -> Option<(i128, i128)> {
    if shares <= 0 || total_shares <= 0 {
        return None;
    }
    let amount_a = (shares * balance_a) / total_shares;
    let amount_b = (shares * balance_b) / total_shares;
    Some((amount_a, amount_b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_shares_subtracts_dead_shares() {
        let shares = initial_shares(1_000_000, 1_000_000).unwrap();
        assert_eq!(shares, 1_000_000 - DEAD_SHARES);
    }

    #[test]
    fn initial_shares_rejects_dust_deposit() {
        assert_eq!(initial_shares(DEAD_SHARES, DEAD_SHARES), None);
        assert_eq!(initial_shares(0, 1_000), None);
        assert_eq!(initial_shares(1_000, 0), None);
        assert_eq!(initial_shares(-1, 1_000), None);
    }

    #[test]
    fn deposit_shares_proportional_to_smaller_ratio() {
        // Pool: 1_000 / 1_000 with 1_000 total shares. Deposit 100 / 200
        // is limited by the A-side ratio: 100 * 1000 / 1000 = 100 shares.
        let shares = deposit_shares(100, 200, 1_000, 1_000, 1_000).unwrap();
        assert_eq!(shares, 100);

        // Same pool, deposit 200 / 100: now limited by the B-side ratio.
        let shares = deposit_shares(200, 100, 1_000, 1_000, 1_000).unwrap();
        assert_eq!(shares, 100);
    }

    #[test]
    fn deposit_shares_does_not_dilute_existing_lps() {
        let balance_a = 5_000i128;
        let balance_b = 10_000i128;
        let total = 7_000i128;

        let minted = deposit_shares(500, 1_000, balance_a, balance_b, total).unwrap();

        // After the deposit the pool holds more reserves than before, and
        // every pre-existing share still lays claim to at least as much:
        let new_total = total + minted;
        let old_claim_a = (total * (balance_a + 500)) / new_total;
        let old_claim_b = (total * (balance_b + 1_000)) / new_total;
        assert!(
            old_claim_a >= balance_a - 1,
            "existing LPs must not lose token A value"
        );
        assert!(
            old_claim_b >= balance_b - 1,
            "existing LPs must not lose token B value"
        );
    }

    #[test]
    fn withdrawal_amounts_are_pro_rata() {
        let (a, b) = withdrawal_amounts(500, 1_000_000, 2_000_000, 1_000).unwrap();
        assert_eq!(a, 500_000);
        assert_eq!(b, 1_000_000);

        // Burning every share empties the pool.
        let (a, b) = withdrawal_amounts(1_000, 1_000_000, 2_000_000, 1_000).unwrap();
        assert_eq!(a, 1_000_000);
        assert_eq!(b, 2_000_000);
    }

    #[test]
    fn withdrawal_amounts_rejects_invalid_input() {
        assert_eq!(withdrawal_amounts(0, 1_000, 1_000, 1_000), None);
        assert_eq!(withdrawal_amounts(10, 1_000, 1_000, 0), None);
        assert_eq!(withdrawal_amounts(-5, 1_000, 1_000, 1_000), None);
    }

    #[test]
    fn isqrt_matches_reference_values() {
        assert_eq!(isqrt(0), 0);
        assert_eq!(isqrt(1), 1);
        assert_eq!(isqrt(2), 1);
        assert_eq!(isqrt(4), 2);
        assert_eq!(isqrt(99), 9);
        assert_eq!(isqrt(1_000_000), 1_000);
        assert_eq!(isqrt(999_999), 999);
    }
}
