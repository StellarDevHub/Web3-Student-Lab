//! Bit-packed bitmap for tracking claimed airdrop recipient indices.
//!
//! Stores 1 bit per recipient index using 128-bit words in persistent storage.
//! Recipient index `i` is stored at word `i / 128` at bit position `i % 128`.

use soroban_sdk::{contracttype, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BitmapKey {
    ClaimWord(u32),
}

pub struct BitMap;

impl BitMap {
    /// Returns true if the recipient at `index` has already claimed.
    pub fn is_claimed(env: &Env, index: u32) -> bool {
        let word_index = index / 128;
        let bit_index = (index % 128) as usize;
        let key = BitmapKey::ClaimWord(word_index);
        let word: u128 = env.storage().persistent().get(&key).unwrap_or(0u128);
        (word & (1u128 << bit_index)) != 0
    }

    /// Sets the bit at `index` to indicate a successful claim.
    pub fn set_claimed(env: &Env, index: u32) {
        let word_index = index / 128;
        let bit_index = (index % 128) as usize;
        let key = BitmapKey::ClaimWord(word_index);
        let mut word: u128 = env.storage().persistent().get(&key).unwrap_or(0u128);
        word |= 1u128 << bit_index;
        env.storage().persistent().set(&key, &word);
    }
}
