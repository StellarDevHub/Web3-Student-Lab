use soroban_sdk::Vec;

pub(crate) fn median(grades: &Vec<i128>) -> Option<i128> {
    let n = grades.len();
    if n == 0 {
        return None;
    }

    let mut sorted = grades.clone();
    let mut i = 1u32;
    while i < n {
        let value = sorted.get(i)?;
        let mut j = i;
        while j > 0 {
            let previous = sorted.get(j - 1)?;
            if previous <= value {
                break;
            }
            sorted.set(j, previous);
            j -= 1;
        }
        sorted.set(j, value);
        i += 1;
    }

    if n % 2 == 1 {
        sorted.get(n / 2)
    } else {
        let lower = sorted.get(n / 2 - 1)?;
        let upper = sorted.get(n / 2)?;
        Some(lower / 2 + upper / 2 + (lower % 2 + upper % 2) / 2)
    }
}

pub(crate) fn standard_deviation(grades: &Vec<i128>) -> Option<i128> {
    let n = grades.len();
    if n == 0 {
        return None;
    }
    let divisor = i128::from(n);
    let sum = grades
        .iter()
        .try_fold(0i128, |total, grade| total.checked_add(grade))?;
    let mean = sum / divisor;

    let squared_deviation_sum = grades.iter().try_fold(0u128, |total, grade| {
        let deviation = grade.abs_diff(mean);
        total.checked_add(deviation.checked_mul(deviation)?)
    })?;

    let variance = squared_deviation_sum / u128::from(n);
    i128::try_from(integer_sqrt(variance)).ok()
}

fn integer_sqrt(value: u128) -> u128 {
    if value < 2 {
        return value;
    }
    let mut estimate = value;
    let mut next = estimate / 2 + estimate % 2;
    while next < estimate {
        estimate = next;
        let quotient = value / estimate;
        next = estimate / 2 + quotient / 2 + (estimate % 2 + quotient % 2) / 2;
    }
    estimate
}
