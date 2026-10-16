//! Time-decay engine implementing exponential decay without floating point arithmetic.
//! Formula: R_t = R_0 * 2^(-t / T)

/// Default 6-month epoch half-life (180 days in seconds)
pub const DEFAULT_HALF_LIFE_SECONDS: u64 = 180 * 24 * 3600; // 15,552,000s

/// Maximum reputation score cap to prevent entrenched monopoly power
pub const MAX_REPUTATION_SCORE: u64 = 10_000;

/// Computes R_t = R_0 * 2^(-t / T) using pure integer arithmetic with scaled basis points.
pub fn apply_exponential_decay(
    initial_score: u64,
    elapsed_seconds: u64,
    half_life_seconds: u64,
) -> u64 {
    if initial_score == 0 || elapsed_seconds == 0 || half_life_seconds == 0 {
        return initial_score;
    }

    let whole_epochs = elapsed_seconds / half_life_seconds;
    if whole_epochs >= 64 {
        return 0;
    }

    // Integer halving for full epochs: R_0 >> whole_epochs
    let base_score = initial_score >> whole_epochs;
    if base_score == 0 {
        return 0;
    }

    let remainder_seconds = elapsed_seconds % half_life_seconds;
    if remainder_seconds == 0 {
        return base_score;
    }

    // Fractional decay for remaining seconds: 2^(-r / T)
    // Approximate 2^(-u) on [0, 1] via quadratic integer polynomial:
    // f(u) = 10000 - 6931 * u + 1931 * u^2 (where u = remainder / T in 10,000 bps)
    let u = (remainder_seconds as u128 * 10_000) / (half_life_seconds as u128);
    let term1: u128 = 10_000;
    let term2: u128 = (6931 * u) / 10_000;
    let term3: u128 = (1931 * u * u) / 100_000_000;

    let decay_bps = term1.saturating_sub(term2).saturating_add(term3);
    let decayed = (base_score as u128 * decay_bps) / 10_000;

    decayed as u64
}
