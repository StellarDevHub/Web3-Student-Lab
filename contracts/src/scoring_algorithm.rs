//! Scoring Algorithm — pure computation module (no storage, no contract).
//!
//! Provides:
//! - Weighted points per activity type
//! - Consistency multipliers
//! - Time-based decay calculation
//! - Attestation bonus calculation

#![allow(unused)]

use crate::reputation_system::ActivityType;

pub struct ScoringAlgorithm;

impl ScoringAlgorithm {
    // ── Activity weights ──────────────────────────────────────────────────────

    /// Base weight multiplier (in basis points, 100 = 1×) per activity type.
    pub fn activity_weight_bps(activity: ActivityType) -> u32 {
        match activity {
            ActivityType::CourseCompletion  => 200, // 2×
            ActivityType::ContributionMerged => 300, // 3×
            ActivityType::HackathonWin      => 500, // 5×
            ActivityType::PeerReview        => 150, // 1.5×
            ActivityType::AttendedEvent     => 100, // 1×
        }
    }

    /// Apply activity weight to base points.
    pub fn weighted_points(activity: ActivityType, base: i64) -> i64 {
        let bps = Self::activity_weight_bps(activity) as i64;
        (base * bps) / 100
    }

    // ── Consistency multiplier ────────────────────────────────────────────────

    /// Returns a multiplier in basis points based on consecutive active days.
    /// Rewards users who engage regularly.
    pub fn consistency_multiplier_bps(streak_days: u32) -> u32 {
        match streak_days {
            0..=6   => 100,  // 1× — no bonus
            7..=29  => 110,  // 1.1×
            30..=89 => 125,  // 1.25×
            _       => 150,  // 1.5× — 90+ day streak
        }
    }

    /// Apply consistency multiplier to already-weighted points.
    pub fn apply_multiplier(points: i64, streak_days: u32) -> i64 {
        let bps = Self::consistency_multiplier_bps(streak_days) as i64;
        (points * bps) / 100
    }

    // ── Decay ─────────────────────────────────────────────────────────────────

    /// Compound decay over `days` at `rate_bps` per day.
    /// Uses integer approximation: score × (1 - rate/10000)^days.
    /// Returns the amount to subtract (always ≥ 0).
    pub fn decay_amount(score: i64, rate_bps: u32, days: u32) -> i64 {
        if score <= 0 || rate_bps == 0 || days == 0 {
            return 0;
        }
        // Iterative compound: avoids floating point.
        let mut remaining = score;
        for _ in 0..days {
            let loss = (remaining * rate_bps as i64) / 10_000;
            remaining -= loss;
            if remaining <= 0 {
                return score;
            }
        }
        (score - remaining).max(0)
    }

    // ── Attestation bonus ─────────────────────────────────────────────────────

    /// Convert an attestation weight (1–100) into reputation points.
    /// Linear: 1 weight unit = 5 points.
    pub fn attestation_bonus(weight: u32) -> i64 {
        (weight as i64) * 5
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_weighted_points() {
        // CourseCompletion = 2×, so 100 base → 200
        assert_eq!(ScoringAlgorithm::weighted_points(ActivityType::CourseCompletion, 100), 200);
        // HackathonWin = 5×
        assert_eq!(ScoringAlgorithm::weighted_points(ActivityType::HackathonWin, 100), 500);
    }

    #[test]
    fn test_consistency_multiplier() {
        assert_eq!(ScoringAlgorithm::consistency_multiplier_bps(0), 100);
        assert_eq!(ScoringAlgorithm::consistency_multiplier_bps(7), 110);
        assert_eq!(ScoringAlgorithm::consistency_multiplier_bps(30), 125);
        assert_eq!(ScoringAlgorithm::consistency_multiplier_bps(90), 150);
    }

    #[test]
    fn test_apply_multiplier() {
        // 7-day streak: 1.1× on 200 pts = 220
        assert_eq!(ScoringAlgorithm::apply_multiplier(200, 7), 220);
    }

    #[test]
    fn test_decay_reduces_score() {
        let decay = ScoringAlgorithm::decay_amount(1000, 100, 1); // 1%/day for 1 day
        assert_eq!(decay, 10);
    }

    #[test]
    fn test_decay_zero_days() {
        assert_eq!(ScoringAlgorithm::decay_amount(1000, 100, 0), 0);
    }

    #[test]
    fn test_decay_compound() {
        // 10%/day for 2 days: 1000 → 900 → 810, decay = 190
        let decay = ScoringAlgorithm::decay_amount(1000, 1000, 2);
        assert_eq!(decay, 190);
    }

    #[test]
    fn test_attestation_bonus() {
        assert_eq!(ScoringAlgorithm::attestation_bonus(10), 50);
        assert_eq!(ScoringAlgorithm::attestation_bonus(100), 500);
    }
}
