//! Reputation Scoring Algorithm (#399)
//!
//! Pure calculation module (no contract storage) used by reputation_system.rs.
//!
//! Design:
//! - All math uses integer arithmetic with PRECISION = 1_000_000 to avoid floats.
//! - Weighted base points per activity type.
//! - Consistency multiplier: bonus for activity streaks.
//! - Time-based exponential decay: score halves every HALF_LIFE_LEDGERS ledgers.

/// Fixed-point precision factor (6 decimal places).
pub const PRECISION: u128 = 1_000_000;

/// Approximate ledgers per day at ~5 s/ledger.
pub const LEDGERS_PER_DAY: u32 = 17_280;

/// Score halves every 30 days worth of ledgers.
pub const HALF_LIFE_LEDGERS: u32 = LEDGERS_PER_DAY * 30;

// ---------------------------------------------------------------------------
// Activity types and base weights
// ---------------------------------------------------------------------------

/// Activity types that generate reputation points.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ActivityType {
    /// Completing a course / earning a certificate.
    CourseCompletion,
    /// Submitting a peer review.
    PeerReview,
    /// Receiving a positive peer attestation.
    Attestation,
    /// Contributing to open-source (PR merged).
    OpenSourceContribution,
    /// Participating in a hackathon.
    HackathonParticipation,
    /// Daily platform login / engagement.
    DailyEngagement,
}

impl ActivityType {
    /// Base reputation points for this activity (scaled by PRECISION).
    pub fn base_points(self) -> u128 {
        match self {
            ActivityType::CourseCompletion => 500 * PRECISION,
            ActivityType::PeerReview => 100 * PRECISION,
            ActivityType::Attestation => 150 * PRECISION,
            ActivityType::OpenSourceContribution => 300 * PRECISION,
            ActivityType::HackathonParticipation => 200 * PRECISION,
            ActivityType::DailyEngagement => 10 * PRECISION,
        }
    }
}

// ---------------------------------------------------------------------------
// Consistency multiplier
// ---------------------------------------------------------------------------

/// Returns a multiplier (in PRECISION units) based on consecutive active days.
///
/// | Streak (days) | Multiplier |
/// |---------------|------------|
/// | 0–6           | 1.0×       |
/// | 7–29          | 1.25×      |
/// | 30–89         | 1.5×       |
/// | 90+           | 2.0×       |
pub fn consistency_multiplier(streak_days: u32) -> u128 {
    match streak_days {
        0..=6 => PRECISION,
        7..=29 => PRECISION * 125 / 100,
        30..=89 => PRECISION * 150 / 100,
        _ => PRECISION * 200 / 100,
    }
}

// ---------------------------------------------------------------------------
// Weighted score calculation
// ---------------------------------------------------------------------------

/// Calculate raw points for a single activity, applying the consistency multiplier.
///
/// Returns value in PRECISION units; divide by PRECISION for display.
pub fn calculate_activity_points(activity: ActivityType, streak_days: u32) -> u128 {
    let base = activity.base_points();
    let mult = consistency_multiplier(streak_days);
    // base * mult / PRECISION keeps the result in PRECISION units
    base * mult / PRECISION
}

// ---------------------------------------------------------------------------
// Decay calculation
// ---------------------------------------------------------------------------

/// Apply exponential decay to a score.
///
/// Uses the approximation: decayed = score * (1/2)^(elapsed / HALF_LIFE)
///
/// Implemented with integer math via repeated halving to avoid floats.
/// For precision, we use: decayed = score * decay_factor / PRECISION
/// where decay_factor = PRECISION * 2^(-elapsed/HALF_LIFE).
///
/// We approximate 2^(-x) ≈ (1 - x*ln2) for small x, but for larger x
/// we use iterative halving (each full half-life halves the score).
pub fn apply_decay(score: u128, elapsed_ledgers: u32) -> u128 {
    if score == 0 || elapsed_ledgers == 0 {
        return score;
    }

    let full_halvings = elapsed_ledgers / HALF_LIFE_LEDGERS;
    let remainder = elapsed_ledgers % HALF_LIFE_LEDGERS;

    // Apply full halvings
    let mut decayed = score;
    for _ in 0..full_halvings {
        decayed /= 2;
    }

    // Apply fractional halving: factor = 1 - remainder/HALF_LIFE * ln2
    // ln2 ≈ 693147 / 1_000_000
    // fraction = remainder * 693_147 / (HALF_LIFE_LEDGERS * 1_000_000)
    let ln2_num: u128 = 693_147;
    let ln2_den: u128 = 1_000_000;
    let frac_decay = (remainder as u128 * ln2_num)
        / (HALF_LIFE_LEDGERS as u128 * ln2_den / PRECISION);
    // decay_factor = PRECISION - frac_decay (clamped to 0)
    let decay_factor = PRECISION.saturating_sub(frac_decay);
    decayed * decay_factor / PRECISION
}

/// Calculate the effective (decayed) score given raw score and last-update ledger.
pub fn effective_score(raw_score: u128, last_update_ledger: u32, current_ledger: u32) -> u128 {
    let elapsed = current_ledger.saturating_sub(last_update_ledger);
    apply_decay(raw_score, elapsed)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn course_completion_base_points() {
        let pts = calculate_activity_points(ActivityType::CourseCompletion, 0);
        assert_eq!(pts, 500 * PRECISION);
    }

    #[test]
    fn streak_multiplier_applied() {
        let no_streak = calculate_activity_points(ActivityType::PeerReview, 0);
        let streak = calculate_activity_points(ActivityType::PeerReview, 7);
        assert!(streak > no_streak);
        assert_eq!(streak, 125 * PRECISION); // 100 * 1.25
    }

    #[test]
    fn no_decay_at_zero_elapsed() {
        assert_eq!(apply_decay(1_000_000, 0), 1_000_000);
    }

    #[test]
    fn full_half_life_halves_score() {
        let score = 1_000 * PRECISION;
        let decayed = apply_decay(score, HALF_LIFE_LEDGERS);
        assert_eq!(decayed, score / 2);
    }

    #[test]
    fn two_half_lives_quarters_score() {
        let score = 1_000 * PRECISION;
        let decayed = apply_decay(score, HALF_LIFE_LEDGERS * 2);
        assert_eq!(decayed, score / 4);
    }

    #[test]
    fn partial_decay_reduces_score() {
        let score = 1_000 * PRECISION;
        let decayed = apply_decay(score, HALF_LIFE_LEDGERS / 2);
        assert!(decayed < score);
        assert!(decayed > score / 2);
    }

    #[test]
    fn effective_score_uses_ledger_diff() {
        let score = 1_000 * PRECISION;
        let result = effective_score(score, 100, 100 + HALF_LIFE_LEDGERS);
        assert_eq!(result, score / 2);
    }
}
