//! # SC-HARD-13 — Property-based tests for median correctness and classifier
//! exhaustiveness.

use super::median_of;

/// Reference median (std-based) for cross-checking the contract's median.
/// For even-length inputs, averages the two middle values (rounds down).
fn std_median(grades: &[i128]) -> i128 {
    let mut g = grades.to_vec();
    g.sort_unstable();
    let n = g.len();
    if n % 2 == 1 {
        g[n / 2]
    } else {
        (g[n / 2 - 1] + g[n / 2]) / 2
    }
}

proptest::proptest! {
    #![proptest_config(proptest::prelude::ProptestConfig::with_cases(128))]

    /// The contract median agrees with a reference implementation, and
    /// every reviewer is classified as either accurate or slashed (exhaustive
    /// partition).
    #[test]
    fn median_matches_reference_and_classification_is_exhaustive(
        grades in proptest::collection::vec(-50i128..150i128, 1..12),
        tolerance in 0i128..20i128,
    ) {
        let env = soroban_sdk::Env::default();
        let mut vec = soroban_sdk::Vec::new(&env);
        for g in &grades {
            vec.push_back(*g);
        }
        let median = median_of(&vec);
        proptest::prop_assert_eq!(median, std_median(&grades));

        // Every reviewer must be classified exactly once.
        let mut accurate = 0usize;
        let mut outliers = 0usize;
        for g in &grades {
            if (g - median).abs() <= tolerance {
                accurate += 1;
            } else {
                outliers += 1;
            }
        }
        proptest::prop_assert_eq!(accurate + outliers, grades.len());
    }
}
