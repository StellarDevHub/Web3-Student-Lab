use soroban_sdk::Vec;

pub fn median(values: &Vec<i128>) -> Option<i128> {
    if values.is_empty() {
        return None;
    }

    let mut sorted = values.clone();
    for i in 1..sorted.len() {
        let value = sorted.get(i).unwrap();
        let mut j = i;
        while j > 0 && sorted.get(j - 1).unwrap() > value {
            let previous = sorted.get(j - 1).unwrap();
            sorted.set(j, previous);
            j -= 1;
        }
        sorted.set(j, value);
    }

    let middle = sorted.get(sorted.len() / 2).unwrap();
    if sorted.len() % 2 == 1 {
        Some(middle)
    } else {
        let lower = sorted.get(sorted.len() / 2 - 1).unwrap();
        let quotient = lower / 2 + middle / 2;
        let remainder = lower % 2 + middle % 2;
        Some(quotient + remainder / 2)
    }
}

pub fn deviation_bps(price: i128, consensus: i128) -> i128 {
    if consensus <= 0 {
        return i128::MAX;
    }
    let diff = if price >= consensus {
        price - consensus
    } else {
        consensus - price
    };
    diff.checked_mul(10_000)
        .map(|scaled| scaled / consensus)
        .unwrap_or(i128::MAX)
}
