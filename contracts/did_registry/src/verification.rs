//! DID string parsing and shared authorization helpers for `did:stellar:`.
//!
//! Spec key file for SC-010. The registry stores DIDs as raw 32-byte keys,
//! but the `did:stellar` method's external form is the canonical W3C string
//! `did:stellar:<64 hex chars>`. Everything in this module is pure and
//! side-effect free so it can be unit tested without deploying the contract.

use crate::types::DIDDocument;
use soroban_sdk::{Address, BytesN, Env, String};

/// Canonical `did:stellar:` method prefix.
pub const DID_PREFIX: &[u8] = b"did:stellar:";

/// Canonical length: 12-byte prefix + 64 hex chars encoding 32 bytes.
pub const DID_STR_LEN: usize = 76;

/// Lowercase hex digits used when formatting DIDs.
const HEX: &[u8; 16] = b"0123456789abcdef";

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Structural validation of a `did:stellar:` string. Never panics.
///
/// Accepts exactly `did:stellar:` followed by 64 hex chars (either case),
/// and rejects everything else: wrong prefix, wrong method, wrong length,
/// non-hex payload, or any extra suffix.
pub fn is_valid_did_string(did: &String) -> bool {
    check(did).is_some()
}

fn check(did: &String) -> Option<()> {
    let b = did.to_bytes();
    if b.len() as usize != DID_STR_LEN {
        return None;
    }
    for (i, expected) in DID_PREFIX.iter().enumerate() {
        if b.get(i as u32)? != *expected {
            return None;
        }
    }
    for i in DID_PREFIX.len()..DID_STR_LEN {
        hex_nibble(b.get(i as u32)?)?;
    }
    Some(())
}

/// Parse a canonical `did:stellar:<hex>` string into its raw 32-byte key.
/// Returns `None` when the string is malformed.
pub fn parse_did_string(env: &Env, did: &String) -> Option<BytesN<32>> {
    check(did)?;
    let b = did.to_bytes();
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        let hi = hex_nibble(b.get((DID_PREFIX.len() + 2 * i) as u32)?)?;
        let lo = hex_nibble(b.get((DID_PREFIX.len() + 2 * i + 1) as u32)?)?;
        *byte = (hi << 4) | lo;
    }
    Some(BytesN::from_array(env, &out))
}

/// Format a raw 32-byte DID key as its canonical lowercase
/// `did:stellar:<hex>` string. Exact inverse of [`parse_did_string`].
pub fn did_to_string(env: &Env, did: &BytesN<32>) -> String {
    let raw = did.to_array();
    let mut buf = [0u8; DID_STR_LEN];
    buf[..DID_PREFIX.len()].copy_from_slice(DID_PREFIX);
    for (i, byte) in raw.iter().enumerate() {
        buf[DID_PREFIX.len() + 2 * i] = HEX[(byte >> 4) as usize];
        buf[DID_PREFIX.len() + 2 * i + 1] = HEX[(byte & 0x0f) as usize];
    }
    String::from_bytes(env, &buf)
}

/// Shared authorization predicate: sender is the DID owner or a controller.
pub fn is_owner_or_controller(doc: &DIDDocument, sender: &Address) -> bool {
    doc.owner == *sender || doc.controllers.contains(sender)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, Map, Vec};

    /// Concatenate byte parts into a soroban String (no alloc needed).
    fn pad(env: &Env, parts: &[&[u8]]) -> String {
        let mut buf = [0u8; 256];
        let mut n = 0usize;
        for p in parts {
            buf[n..n + p.len()].copy_from_slice(p);
            n += p.len();
        }
        String::from_bytes(env, &buf[..n])
    }

    /// Canonical `did:stellar:` + 64 hex chars of `[byte; 32]`,
    /// built with hardcoded digits (independent of the nibble math above).
    fn canonical(env: &Env, hi: u8, lo: u8) -> String {
        let mut buf = [0u8; DID_STR_LEN];
        buf[..DID_PREFIX.len()].copy_from_slice(DID_PREFIX);
        for i in 0..32 {
            buf[DID_PREFIX.len() + 2 * i] = hi;
            buf[DID_PREFIX.len() + 2 * i + 1] = lo;
        }
        String::from_bytes(env, &buf)
    }

    #[test]
    fn test_parse_accepts_canonical_string() {
        let env = Env::default();
        let canonical = canonical(&env, b'a', b'b');
        assert!(is_valid_did_string(&canonical));
        let key = parse_did_string(&env, &canonical).unwrap();
        assert_eq!(key, BytesN::from_array(&env, &[0xabu8; 32]));
    }

    #[test]
    fn test_parse_accepts_uppercase_hex() {
        let env = Env::default();
        let upper = canonical(&env, b'A', b'B');
        assert!(is_valid_did_string(&upper));
        let key = parse_did_string(&env, &upper).unwrap();
        assert_eq!(key, BytesN::from_array(&env, &[0xabu8; 32]));
    }

    #[test]
    fn test_format_roundtrips() {
        let env = Env::default();
        let key = BytesN::from_array(&env, &[0xabu8; 32]);
        let text = did_to_string(&env, &key);
        assert_eq!(text, canonical(&env, b'a', b'b'));
        assert_eq!(parse_did_string(&env, &text), Some(key));
    }

    #[test]
    fn test_rejects_malformed_strings() {
        let env = Env::default();
        let hex64 = [b'a'; 64];
        // Sanity: the constructed happy-path string is valid.
        assert!(is_valid_did_string(&pad(&env, &[b"did:stellar:", &hex64])));
        let cases = [
            pad(&env, &[]),                              // empty
            pad(&env, &[b"did:stellar:"]),               // prefix only
            pad(&env, &[b"did:stellar:", &hex64[..63]]), // 63 hex (75 chars)
            pad(&env, &[b"did:stellar:", &hex64, b"a"]), // 65 hex (77 chars)
            pad(&env, &[b"did:stellar:", &[b'z'; 64]]),  // non-hex payload
            pad(&env, &[b"did:ethr:", &hex64]),          // wrong method
            pad(&env, &[b"did:STELLAR:", &hex64]),       // case-sensitive prefix
            pad(&env, &[&hex64]),                        // no prefix
            pad(&env, &[b"did:stellar:", &hex64, b"x"]), // trailing suffix
            pad(&env, &[b"xdid:stellar:", &hex64]),      // leading garbage
        ];
        for case in cases {
            assert!(!is_valid_did_string(&case), "must reject: {case:?}");
            assert!(
                parse_did_string(&env, &case).is_none(),
                "must reject: {case:?}"
            );
        }
    }

    #[test]
    fn test_owner_or_controller_predicate() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let stranger = Address::generate(&env);
        let mut doc = DIDDocument {
            owner: owner.clone(),
            github_handle: None,
            social_identities: Map::new(&env),
            verification_key: None,
            attributes: Map::new(&env),
            controllers: Vec::new(&env),
            revoked: false,
            proofs: Vec::new(&env),
        };
        assert!(is_owner_or_controller(&doc, &owner));
        assert!(!is_owner_or_controller(&doc, &stranger));
        doc.controllers.push_back(stranger.clone());
        assert!(is_owner_or_controller(&doc, &stranger));
    }
}
