use crate::rlp;
use soroban_sdk::{Bytes, BytesN, Env, Vec};

pub fn verify_proof(
    env: &Env,
    root: &BytesN<32>,
    key: &Bytes,
    expected_value: &Bytes,
    proof: &Vec<Bytes>,
) -> bool {
    if key.is_empty() || proof.is_empty() || proof.len() > 64 {
        return false;
    }
    let mut expected_node = Bytes::from(root.clone());
    let mut nibble_index = 0u32;
    let mut total_proof_bytes = 0u32;

    for proof_index in 0..proof.len() {
        let node_bytes = match proof.get(proof_index) {
            Some(node) => node,
            None => return false,
        };
        total_proof_bytes = match total_proof_bytes.checked_add(node_bytes.len()) {
            Some(total) if total <= 65_536 => total,
            _ => return false,
        };
        if node_bytes.is_empty() || node_bytes.len() > 32_768 {
            return false;
        }
        if !reference_matches(env, &expected_node, &node_bytes) {
            return false;
        }
        let root_item = match rlp::decode(&node_bytes, 0) {
            Some(item) if item.is_list && item.total_len == node_bytes.len() => item,
            _ => return false,
        };
        let count = match rlp::list_len(&node_bytes, root_item) {
            Some(count) => count,
            None => return false,
        };

        if count == 17 {
            if nibble_index == key.len().saturating_mul(2) {
                let value_item = match rlp::list_item(&node_bytes, root_item, 16) {
                    Some(item) => item,
                    None => return false,
                };
                let value = match rlp::payload(&node_bytes, value_item) {
                    Some(value) => value,
                    None => return false,
                };
                return proof_index + 1 == proof.len() && value.eq(expected_value);
            }
            let nibble = match key_nibble(key, nibble_index) {
                Some(nibble) => nibble as u32,
                None => return false,
            };
            let child = match rlp::list_item(&node_bytes, root_item, nibble) {
                Some(item) => item,
                None => return false,
            };
            expected_node = match child_reference(&node_bytes, child) {
                Some(reference) if !reference.is_empty() => reference,
                _ => return false,
            };
            nibble_index += 1;
        } else if count == 2 {
            let path_item = match rlp::list_item(&node_bytes, root_item, 0) {
                Some(item) if !item.is_list => item,
                _ => return false,
            };
            let compact_path = match rlp::payload(&node_bytes, path_item) {
                Some(path) if !path.is_empty() => path,
                _ => return false,
            };
            let (leaf, segment_start) = match decode_compact_path(&compact_path) {
                Some(decoded) => decoded,
                None => return false,
            };
            let segment_nibbles = compact_path
                .len()
                .saturating_mul(2)
                .saturating_sub(segment_start);
            if !leaf && segment_nibbles == 0 {
                return false;
            }
            if nibble_index + segment_nibbles > key.len().saturating_mul(2) {
                return false;
            }
            for offset in 0..segment_nibbles {
                let key_value = match key_nibble(key, nibble_index + offset) {
                    Some(value) => value,
                    None => return false,
                };
                let path_value = match compact_nibble(&compact_path, segment_start, offset) {
                    Some(value) => value,
                    None => return false,
                };
                if key_value != path_value {
                    return false;
                }
            }
            nibble_index += segment_nibbles;
            let value_item = match rlp::list_item(&node_bytes, root_item, 1) {
                Some(item) => item,
                None => return false,
            };
            if leaf {
                if nibble_index != key.len().saturating_mul(2) || value_item.is_list {
                    return false;
                }
                let value = match rlp::payload(&node_bytes, value_item) {
                    Some(value) => value,
                    None => return false,
                };
                return proof_index + 1 == proof.len() && value.eq(expected_value);
            }
            expected_node = match child_reference(&node_bytes, value_item) {
                Some(reference) if !reference.is_empty() => reference,
                _ => return false,
            };
        } else {
            return false;
        }
    }
    false
}

fn reference_matches(env: &Env, reference: &Bytes, node: &Bytes) -> bool {
    if reference.len() == 32 {
        let digest: BytesN<32> = env.crypto().keccak256(node).into();
        return Bytes::from(digest).eq(reference);
    }
    reference == node
}

fn child_reference(node: &Bytes, child: rlp::Item) -> Option<Bytes> {
    if child.is_list {
        return Some(rlp::encoded(node, child));
    }
    let value = rlp::payload(node, child)?;
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn key_nibble(key: &Bytes, index: u32) -> Option<u8> {
    let byte = key.get(index / 2)?;
    Some(if index % 2 == 0 {
        byte >> 4
    } else {
        byte & 0x0f
    })
}

fn decode_compact_path(path: &Bytes) -> Option<(bool, u32)> {
    let flag = path.get(0)? >> 4;
    if flag > 3 {
        return None;
    }
    let odd = flag % 2 == 1;
    if !odd && path.get(0)? & 0x0f != 0 {
        return None;
    }
    Some((flag >= 2, if odd { 1 } else { 2 }))
}

fn compact_nibble(path: &Bytes, start: u32, offset: u32) -> Option<u8> {
    let nibble_index = start.checked_add(offset)?;
    let byte = path.get(nibble_index / 2)?;
    Some(if nibble_index % 2 == 0 {
        byte >> 4
    } else {
        byte & 0x0f
    })
}
