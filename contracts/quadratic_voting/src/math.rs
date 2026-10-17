//! Overflow-safe integer math for quadratic voting (SC-005).
//!
//! All helpers avoid floating point and use checked arithmetic. No helper
//! performs an unchecked `x + 1` or `x + n / x` step, so inputs at the type
//! boundary (e.g. `i128::MAX`) cannot panic.

/// Integer square root: returns `floor(sqrt(n))` for an unsigned 128-bit value.
///
/// Uses the classic digit-by-digit (bitwise) method. Every intermediate value
/// stays below `2^127`, so the additions below cannot overflow; the `checked_*`
/// calls are kept as a defensive guard and are never expected to fail.
pub fn isqrt_u128(n: u128) -> u128 {
    if n < 2 {
        return n;
    }

    let mut num = n;
    let mut res: u128 = 0;

    // Highest power of four that is <= n.
    let mut bit: u128 = 1u128 << 126;
    while bit > num {
        bit >>= 2;
    }

    while bit != 0 {
        // res < 2^64 (it holds the already-determined bits of the root) and
        // bit <= 2^126, so the candidate fits in u128.
        let candidate = res.checked_add(bit).expect("isqrt candidate overflow");
        if num >= candidate {
            num = num.checked_sub(candidate).expect("isqrt remainder underflow");
            res = (res >> 1).checked_add(bit).expect("isqrt result overflow");
        } else {
            res >>= 1;
        }
        bit >>= 2;
    }
    res
}

/// Integer square root for signed 128-bit values.
///
/// Returns `floor(sqrt(n))`, or `0` when `n <= 0`. The result of `i128::MAX`
/// is about `1.3e19` and always fits in `i128`.
pub fn isqrt_i128(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    // n > 0 here, so the cast to u128 is lossless.
    let root = isqrt_u128(n as u128);
    // root <= 2^63 for any positive i128, so the cast back is lossless.
    root as i128
}

/// Checked quadratic cost of moving from `prev_votes` to `prev_votes + additional`.
///
/// Computes `(prev + additional)^2 - prev^2` (the incremental cost of quadratic
/// voting, where a total of `V` votes costs `V^2` credits). Returns `None` if any
/// intermediate step overflows `i128`.
pub fn quadratic_cost(prev_votes: u64, additional: u64) -> Option<i128> {
    let prev = i128::from(prev_votes);
    let total = prev.checked_add(i128::from(additional))?;
    let total_sq = total.checked_mul(total)?;
    let prev_sq = prev.checked_mul(prev)?;
    total_sq.checked_sub(prev_sq)
}
