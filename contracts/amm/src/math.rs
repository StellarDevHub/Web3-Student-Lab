//! High-Precision FixedPoint128 Math Library (SC-049)
//!
//! Provides a 128-bit fixed-point representation with 18 decimal places of precision (`WAD = 10^18`).
//! Implements deterministic rounding modes (`Down` vs `Up`), full 256-bit intermediate arithmetic for
//! `mul_div`, `wad_mul`, `wad_div`, `sqrt`, and `pow`, with clean overflow and division-by-zero detection.

pub const WAD: u128 = 1_000_000_000_000_000_000; // 10^18
pub const HALF_WAD: u128 = WAD / 2;

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Rounding {
    Down,
    Up,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
struct U256 {
    lo: u128,
    hi: u128,
}

impl U256 {
    const ZERO: Self = Self { lo: 0, hi: 0 };

    fn is_zero(&self) -> bool {
        self.lo == 0 && self.hi == 0
    }
}

/// Computes full 128-bit * 128-bit -> 256-bit unsigned multiplication.
fn mul_u128(a: u128, b: u128) -> U256 {
    let a_lo = a as u64 as u128;
    let a_hi = (a >> 64) as u128;
    let b_lo = b as u64 as u128;
    let b_hi = (b >> 64) as u128;

    let p0 = a_lo * b_lo;
    let p1 = a_lo * b_hi;
    let p2 = a_hi * b_lo;
    let p3 = a_hi * b_hi;

    let p1_lo = (p1 as u64) as u128;
    let p1_hi = p1 >> 64;
    let p2_lo = (p2 as u64) as u128;
    let p2_hi = p2 >> 64;

    let lo_sum = (p0 >> 64) + p1_lo + p2_lo;
    let lo_carry = lo_sum >> 64;
    let mid = (lo_sum as u64) as u128;

    let lo = (p0 as u64 as u128) | (mid << 64);
    let hi = p3 + p1_hi + p2_hi + lo_carry;

    U256 { lo, hi }
}

/// Computes 256-bit / 128-bit unsigned division and remainder.
/// Panics on division by zero.
fn div_rem_u256(num: U256, den: u128) -> (U256, u128) {
    if den == 0 {
        panic!("FixedPoint128: division by zero");
    }
    if num.is_zero() {
        return (U256::ZERO, 0);
    }

    let mut quotient = U256::ZERO;
    let mut rem_hi: u8 = 0;
    let mut rem_lo: u128 = 0;

    for i in (0..256).rev() {
        let bit = if i >= 128 {
            ((num.hi >> (i - 128)) & 1) as u128
        } else {
            ((num.lo >> i) & 1) as u128
        };

        let carry = rem_lo >> 127;
        rem_lo = (rem_lo << 1) | bit;
        rem_hi = (rem_hi << 1) | (carry as u8);

        if rem_hi > 0 || rem_lo >= den {
            rem_lo = rem_lo.wrapping_sub(den);
            rem_hi = 0;
            if i >= 128 {
                quotient.hi |= 1 << (i - 128);
            } else {
                quotient.lo |= 1 << i;
            }
        }
    }

    (quotient, rem_lo)
}

/// 256-bit integer square root using Newton-Raphson approximation.
fn sqrt_u256(val: U256) -> u128 {
    if val.is_zero() {
        return 0;
    }
    if val.hi == 0 {
        return sqrt(val.lo);
    }

    let total_bits = 256 - val.hi.leading_zeros();
    let shift = ((total_bits + 1) / 2).min(127);
    let mut x0 = 1u128 << shift;

    loop {
        let (q, _) = div_rem_u256(val, x0);
        if q.hi > 0 {
            x0 = (x0 + u128::MAX) / 2;
            continue;
        }
        let x1 = (x0 + q.lo) / 2;
        if x1 >= x0 {
            return x0;
        }
        x0 = x1;
    }
}

/// Computes `(a * b) / denominator` using full 256-bit intermediate precision.
/// Panics on division by zero or if the resulting quotient overflows `u128`.
pub fn mul_div(a: u128, b: u128, denominator: u128, rounding: Rounding) -> u128 {
    if denominator == 0 {
        panic!("FixedPoint128: division by zero");
    }

    let prod = mul_u128(a, b);
    let (quot, rem) = div_rem_u256(prod, denominator);

    if quot.hi > 0 {
        panic!("FixedPoint128: numeric overflow in mul_div");
    }

    let mut result = quot.lo;
    if rounding == Rounding::Up && rem > 0 {
        result = result
            .checked_add(1)
            .expect("FixedPoint128: numeric overflow on round up");
    }

    result
}

/// Computes `(a * b) / 10^18` (WAD multiplication) with explicit rounding.
pub fn wad_mul(a: u128, b: u128, rounding: Rounding) -> u128 {
    mul_div(a, b, WAD, rounding)
}

/// Computes `(a * 10^18) / b` (WAD division) with explicit rounding.
pub fn wad_div(a: u128, b: u128, rounding: Rounding) -> u128 {
    mul_div(a, WAD, b, rounding)
}

/// Computes integer square root `floor(sqrt(x))` using the Babylonian method.
pub fn sqrt(x: u128) -> u128 {
    if x == 0 {
        return 0;
    }
    let mut x0 = 1u128 << ((128 - x.leading_zeros() + 1) / 2);
    loop {
        let x1 = (x0 + x / x0) / 2;
        if x1 >= x0 {
            return x0;
        }
        x0 = x1;
    }
}

/// Computes fixed-point square root: `floor(sqrt(x * 10^18))`.
/// Satisfies `wad_sqrt(WAD) == WAD`.
pub fn wad_sqrt(x: u128) -> u128 {
    if x == 0 {
        return 0;
    }
    let prod = mul_u128(x, WAD);
    sqrt_u256(prod)
}

/// Computes integer power `base^exp` with overflow detection.
pub fn pow(mut base: u128, mut exp: u32) -> u128 {
    if exp == 0 {
        return 1;
    }
    let mut result: u128 = 1;
    while exp > 0 {
        if exp & 1 == 1 {
            result = result
                .checked_mul(base)
                .expect("FixedPoint128: overflow in pow");
        }
        if exp > 1 {
            base = base
                .checked_mul(base)
                .expect("FixedPoint128: overflow in pow");
        }
        exp >>= 1;
    }
    result
}

/// Computes fixed-point power `(base / 10^18)^exp * 10^18` with overflow detection.
pub fn wad_pow(mut base: u128, mut exp: u32, rounding: Rounding) -> u128 {
    if exp == 0 {
        return WAD;
    }
    let mut result: u128 = WAD;
    while exp > 0 {
        if exp & 1 == 1 {
            result = wad_mul(result, base, rounding);
        }
        if exp > 1 {
            base = wad_mul(base, base, rounding);
        }
        exp >>= 1;
    }
    result
}

/// 128-bit Fixed-Point type with 18 decimal places of precision.
#[derive(Copy, Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct FixedPoint128(pub u128);

impl FixedPoint128 {
    pub const ZERO: Self = Self(0);
    pub const ONE: Self = Self(WAD);

    pub fn from_raw(raw: u128) -> Self {
        Self(raw)
    }

    pub fn to_raw(self) -> u128 {
        self.0
    }

    pub fn from_integer(val: u128) -> Self {
        let raw = val
            .checked_mul(WAD)
            .expect("FixedPoint128: overflow converting from integer");
        Self(raw)
    }

    pub fn to_integer(self, rounding: Rounding) -> u128 {
        let mut int_val = self.0 / WAD;
        if rounding == Rounding::Up && (self.0 % WAD) > 0 {
            int_val = int_val
                .checked_add(1)
                .expect("FixedPoint128: overflow converting to integer");
        }
        int_val
    }

    pub fn add(self, other: Self) -> Self {
        Self(
            self.0
                .checked_add(other.0)
                .expect("FixedPoint128: addition overflow"),
        )
    }

    pub fn sub(self, other: Self) -> Self {
        Self(
            self.0
                .checked_sub(other.0)
                .expect("FixedPoint128: subtraction underflow"),
        )
    }

    pub fn mul(self, other: Self, rounding: Rounding) -> Self {
        Self(wad_mul(self.0, other.0, rounding))
    }

    pub fn div(self, other: Self, rounding: Rounding) -> Self {
        Self(wad_div(self.0, other.0, rounding))
    }

    pub fn mul_div(self, b: Self, denominator: Self, rounding: Rounding) -> Self {
        Self(mul_div(self.0, b.0, denominator.0, rounding))
    }

    pub fn sqrt(self) -> Self {
        Self(wad_sqrt(self.0))
    }

    pub fn pow(self, exp: u32, rounding: Rounding) -> Self {
        Self(wad_pow(self.0, exp, rounding))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wad_constants() {
        assert_eq!(WAD, 1_000_000_000_000_000_000);
        assert_eq!(FixedPoint128::ONE.to_raw(), WAD);
        assert_eq!(FixedPoint128::ZERO.to_raw(), 0);
    }

    #[test]
    fn test_mul_div_basic_and_rounding() {
        // 10 * 20 / 4 = 50
        assert_eq!(mul_div(10, 20, 4, Rounding::Down), 50);
        assert_eq!(mul_div(10, 20, 4, Rounding::Up), 50);

        // 10 * 20 / 3 = 66.666...
        assert_eq!(mul_div(10, 20, 3, Rounding::Down), 66);
        assert_eq!(mul_div(10, 20, 3, Rounding::Up), 67);
    }

    #[test]
    fn test_mul_div_large_numbers_no_intermediate_overflow() {
        // a = 2^100, b = 2^100, den = 2^90 -> result = 2^110
        let a = 1u128 << 100;
        let b = 1u128 << 100;
        let den = 1u128 << 90;
        let expected = 1u128 << 110;
        assert_eq!(mul_div(a, b, den, Rounding::Down), expected);
    }

    #[test]
    #[should_panic(expected = "FixedPoint128: division by zero")]
    fn test_mul_div_division_by_zero() {
        mul_div(100, 200, 0, Rounding::Down);
    }

    #[test]
    #[should_panic(expected = "FixedPoint128: numeric overflow in mul_div")]
    fn test_mul_div_numeric_overflow() {
        mul_div(u128::MAX, u128::MAX, 1, Rounding::Down);
    }

    #[test]
    fn test_wad_mul_and_div() {
        let one = FixedPoint128::ONE;
        let two = FixedPoint128::from_integer(2);
        let three = FixedPoint128::from_integer(3);

        // 2 * 3 = 6
        let six = two.mul(three, Rounding::Down);
        assert_eq!(six.to_integer(Rounding::Down), 6);

        // 6 / 2 = 3
        let res_div = six.div(two, Rounding::Down);
        assert_eq!(res_div.to_integer(Rounding::Down), 3);

        // 1 * 1 = 1
        assert_eq!(one.mul(one, Rounding::Down), one);
    }

    #[test]
    fn test_wad_sqrt() {
        // sqrt(1) == 1
        let one = FixedPoint128::ONE;
        assert_eq!(one.sqrt(), one);

        // sqrt(4) == 2
        let four = FixedPoint128::from_integer(4);
        let two = four.sqrt();
        assert_eq!(two.to_integer(Rounding::Down), 2);

        // sqrt(9) == 3
        let nine = FixedPoint128::from_integer(9);
        assert_eq!(nine.sqrt().to_integer(Rounding::Down), 3);

        // sqrt(2) * sqrt(2) approx 2
        let sqrt2 = FixedPoint128::from_integer(2).sqrt();
        let prod = sqrt2.mul(sqrt2, Rounding::Down);
        // within integer precision truncation
        assert!(prod.0 <= 2 * WAD && prod.0 >= 2 * WAD - 5);
    }

    #[test]
    fn test_wad_pow() {
        let two = FixedPoint128::from_integer(2);
        // 2^0 == 1
        assert_eq!(two.pow(0, Rounding::Down), FixedPoint128::ONE);
        // 2^1 == 2
        assert_eq!(two.pow(1, Rounding::Down), two);
        // 2^3 == 8
        assert_eq!(two.pow(3, Rounding::Down).to_integer(Rounding::Down), 8);
        // 2^10 == 1024
        assert_eq!(two.pow(10, Rounding::Down).to_integer(Rounding::Down), 1024);
    }

    #[test]
    fn test_deterministic_rounding_protects_reserves() {
        // Rounding up increases protocol collateral / mint requirements
        let a = 100u128;
        let b = 101u128;
        let c = 3u128;

        let down = mul_div(a, b, c, Rounding::Down);
        let up = mul_div(a, b, c, Rounding::Up);
        assert_eq!(up, down + 1);
    }
}
