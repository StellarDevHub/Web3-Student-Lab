pub fn trigger_met(median: i128, threshold: i128, trigger_above: bool) -> bool {
    if trigger_above {
        median >= threshold
    } else {
        median <= threshold
    }
}
