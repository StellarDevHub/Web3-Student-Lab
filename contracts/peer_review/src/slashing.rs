pub(crate) fn is_acceptable(grade: i128, median: i128, tolerance: i128) -> bool {
    grade.abs_diff(median) <= tolerance as u128
}
