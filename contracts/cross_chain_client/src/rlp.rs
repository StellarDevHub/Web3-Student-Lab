use soroban_sdk::{Bytes, BytesN, Env};

#[derive(Clone, Copy)]
pub struct Item {
    pub start: u32,
    pub payload_start: u32,
    pub payload_len: u32,
    pub total_len: u32,
    pub is_list: bool,
}

pub fn decode(bytes: &Bytes, start: u32) -> Option<Item> {
    if start >= bytes.len() {
        return None;
    }
    let prefix = bytes.get(start)?;
    match prefix {
        0x00..=0x7f => Some(Item {
            start,
            payload_start: start,
            payload_len: 1,
            total_len: 1,
            is_list: false,
        }),
        0x80..=0xb7 => {
            let len = (prefix - 0x80) as u32;
            let payload_start = start.checked_add(1)?;
            if payload_start.checked_add(len)? > bytes.len() {
                return None;
            }
            if len == 1 && bytes.get(payload_start)? < 0x80 {
                return None;
            }
            Some(Item {
                start,
                payload_start,
                payload_len: len,
                total_len: len.checked_add(1)?,
                is_list: false,
            })
        }
        0xb8..=0xbf => decode_long(bytes, start, (prefix - 0xb7) as u32, false),
        0xc0..=0xf7 => {
            let len = (prefix - 0xc0) as u32;
            let payload_start = start.checked_add(1)?;
            if payload_start.checked_add(len)? > bytes.len() {
                return None;
            }
            Some(Item {
                start,
                payload_start,
                payload_len: len,
                total_len: len.checked_add(1)?,
                is_list: true,
            })
        }
        0xf8..=0xff => decode_long(bytes, start, (prefix - 0xf7) as u32, true),
    }
}

fn decode_long(bytes: &Bytes, start: u32, length_of_length: u32, is_list: bool) -> Option<Item> {
    if length_of_length == 0 || length_of_length > 4 {
        return None;
    }
    let length_start = start.checked_add(1)?;
    if length_start.checked_add(length_of_length)? > bytes.len() || bytes.get(length_start)? == 0 {
        return None;
    }
    let mut payload_len = 0u32;
    for offset in 0..length_of_length {
        payload_len = payload_len.checked_mul(256)?;
        payload_len = payload_len.checked_add(bytes.get(length_start + offset)? as u32)?;
    }
    if payload_len < 56 {
        return None;
    }
    let header_len = length_of_length.checked_add(1)?;
    let payload_start = start.checked_add(header_len)?;
    if payload_start.checked_add(payload_len)? > bytes.len() {
        return None;
    }
    Some(Item {
        start,
        payload_start,
        payload_len,
        total_len: header_len.checked_add(payload_len)?,
        is_list,
    })
}

pub fn list_item(bytes: &Bytes, list: Item, index: u32) -> Option<Item> {
    if !list.is_list {
        return None;
    }
    let end = list.payload_start.checked_add(list.payload_len)?;
    let mut cursor = list.payload_start;
    let mut item_index = 0u32;
    while cursor < end {
        let item = decode(bytes, cursor)?;
        if item_index == index {
            if cursor.checked_add(item.total_len)? <= end {
                return Some(item);
            }
            return None;
        }
        cursor = cursor.checked_add(item.total_len)?;
        item_index = item_index.checked_add(1)?;
    }
    None
}

pub fn list_len(bytes: &Bytes, list: Item) -> Option<u32> {
    if !list.is_list {
        return None;
    }
    let end = list.payload_start.checked_add(list.payload_len)?;
    let mut cursor = list.payload_start;
    let mut count = 0u32;
    while cursor < end {
        let item = decode(bytes, cursor)?;
        cursor = cursor.checked_add(item.total_len)?;
        if cursor > end {
            return None;
        }
        count = count.checked_add(1)?;
    }
    if cursor == end {
        Some(count)
    } else {
        None
    }
}

pub fn payload(bytes: &Bytes, item: Item) -> Option<Bytes> {
    if item.is_list {
        return None;
    }
    Some(bytes.slice(item.payload_start..item.payload_start + item.payload_len))
}

pub fn encoded(bytes: &Bytes, item: Item) -> Bytes {
    bytes.slice(item.start..item.start + item.total_len)
}

pub fn uint(bytes: &Bytes, item: Item) -> Option<u64> {
    let value = payload(bytes, item)?;
    if value.len() > 8 || (value.len() > 0 && value.get(0)? == 0) {
        return None;
    }
    let mut number = 0u64;
    for byte in value.iter() {
        number = number.checked_mul(256)?;
        number = number.checked_add(byte as u64)?;
    }
    Some(number)
}

pub fn encode_index(env: &Env, index: u64) -> Bytes {
    if index == 0 {
        return Bytes::from_array(env, &[0x80]);
    }
    let mut value = index;
    let mut raw = [0u8; 8];
    let mut start = raw.len();
    while value > 0 {
        start -= 1;
        raw[start] = (value & 0xff) as u8;
        value >>= 8;
    }
    let len = (raw.len() - start) as u8;
    let mut output = Bytes::new(env);
    if len == 1 && raw[start] < 0x80 {
        output.push_back(raw[start]);
    } else {
        output.push_back(0x80 + len);
        output.append(&Bytes::from_slice(env, &raw[start..]));
    }
    output
}

pub fn evm_header_fields(bytes: &Bytes) -> Option<(BytesN<32>, BytesN<32>, BytesN<32>, u64, u64)> {
    let header = decode(bytes, 0)?;
    let count = list_len(bytes, header)?;
    if !header.is_list
        || header.total_len != bytes.len()
        || (count != 15 && count != 16 && count != 17 && count != 20 && count != 21)
    {
        return None;
    }
    for (index, expected_len) in [
        (0, 32),
        (1, 32),
        (3, 32),
        (4, 32),
        (5, 32),
        (6, 256),
        (13, 32),
        (14, 8),
    ] {
        if payload(bytes, list_item(bytes, header, index)?)?.len() != expected_len {
            return None;
        }
    }
    if payload(bytes, list_item(bytes, header, 2)?)?.len() != 20
        || payload(bytes, list_item(bytes, header, 12)?)?.len() > 32
    {
        return None;
    }
    for index in [7, 8, 9, 10, 11] {
        if !is_canonical_uint(bytes, list_item(bytes, header, index)?, 32) {
            return None;
        }
    }
    if count >= 16 && !is_canonical_uint(bytes, list_item(bytes, header, 15)?, 32) {
        return None;
    }
    if count >= 17 && payload(bytes, list_item(bytes, header, 16)?)?.len() != 32 {
        return None;
    }
    if count >= 20 {
        if !is_canonical_uint(bytes, list_item(bytes, header, 17)?, 32)
            || !is_canonical_uint(bytes, list_item(bytes, header, 18)?, 32)
            || payload(bytes, list_item(bytes, header, 19)?)?.len() != 32
        {
            return None;
        }
    }
    if count == 21 && payload(bytes, list_item(bytes, header, 20)?)?.len() != 32 {
        return None;
    }
    let state_root = bytes32(bytes, list_item(bytes, header, 3)?)?;
    let tx_root = bytes32(bytes, list_item(bytes, header, 4)?)?;
    let receipt_root = bytes32(bytes, list_item(bytes, header, 5)?)?;
    let block_number = uint(bytes, list_item(bytes, header, 8)?)?;
    let timestamp = uint(bytes, list_item(bytes, header, 11)?)?;
    Some((state_root, tx_root, receipt_root, block_number, timestamp))
}

fn is_canonical_uint(bytes: &Bytes, item: Item, max_len: u32) -> bool {
    match payload(bytes, item) {
        Some(value) => value.len() <= max_len && (value.is_empty() || value.get(0) != Some(0)),
        None => false,
    }
}

fn bytes32(bytes: &Bytes, item: Item) -> Option<BytesN<32>> {
    let value = payload(bytes, item)?;
    if value.len() != 32 {
        return None;
    }
    Some(BytesN::try_from(value).ok()?)
}

pub fn is_receipt(bytes: &Bytes) -> bool {
    if bytes.is_empty() || bytes.len() > 32_768 {
        return false;
    }
    let start = match bytes.get(0) {
        Some(prefix) if prefix < 0x80 => {
            if prefix == 0 {
                return false;
            }
            1
        }
        Some(_) => 0,
        None => return false,
    };
    let receipt = match decode(bytes, start) {
        Some(item) if item.is_list && item.start + item.total_len == bytes.len() => item,
        _ => return false,
    };
    if list_len(bytes, receipt) != Some(4) {
        return false;
    }

    let status_or_root = match list_item(bytes, receipt, 0) {
        Some(item) if !item.is_list => item,
        _ => return false,
    };
    let status = match payload(bytes, status_or_root) {
        Some(value) => value,
        None => return false,
    };
    if status.len() != 0 && status.len() != 1 && status.len() != 32 {
        return false;
    }
    if status.len() == 1 && status.get(0).unwrap_or(2) > 1 {
        return false;
    }

    let cumulative_gas = match list_item(bytes, receipt, 1) {
        Some(item) => item,
        None => return false,
    };
    if uint(bytes, cumulative_gas).is_none() {
        return false;
    }
    match list_item(bytes, receipt, 2).and_then(|item| payload(bytes, item)) {
        Some(bloom) if bloom.len() == 256 => {}
        _ => return false,
    }
    let logs = match list_item(bytes, receipt, 3) {
        Some(item) if item.is_list => item,
        _ => return false,
    };
    let log_count = match list_len(bytes, logs) {
        Some(count) if count <= 128 => count,
        None => return false,
        _ => return false,
    };
    for index in 0..log_count {
        let log = match list_item(bytes, logs, index) {
            Some(item) if item.is_list && list_len(bytes, item) == Some(3) => item,
            _ => return false,
        };
        let address = match list_item(bytes, log, 0).and_then(|item| payload(bytes, item)) {
            Some(address) if address.len() == 20 => address,
            _ => return false,
        };
        let _ = address;
        let topics = match list_item(bytes, log, 1) {
            Some(item) if item.is_list => item,
            _ => return false,
        };
        let topic_count = match list_len(bytes, topics) {
            Some(count) if count <= 16 => count,
            None => return false,
            _ => return false,
        };
        for topic_index in 0..topic_count {
            match list_item(bytes, topics, topic_index).and_then(|item| payload(bytes, item)) {
                Some(topic) if topic.len() == 32 => {}
                _ => return false,
            }
        }
        match list_item(bytes, log, 2) {
            Some(item) if !item.is_list => {}
            _ => return false,
        }
    }
    true
}

pub fn receipt_has_lock(
    env: &Env,
    bytes: &Bytes,
    bridge_address: &Bytes,
    lock_topic: &BytesN<32>,
    asset_id: &BytesN<32>,
    recipient: &BytesN<32>,
    amount: i128,
) -> bool {
    if amount <= 0 || !is_receipt(bytes) || bridge_address.len() != 20 {
        return false;
    }
    let start = if bytes.get(0).unwrap_or(0x80) < 0x80 {
        1
    } else {
        0
    };
    let receipt = match decode(bytes, start) {
        Some(item) => item,
        None => return false,
    };
    let logs = match list_item(bytes, receipt, 3) {
        Some(item) => item,
        None => return false,
    };
    let expected_amount = amount as u128;
    let mut amount_word = [0u8; 32];
    let amount_bytes = expected_amount.to_be_bytes();
    amount_word[16..].copy_from_slice(&amount_bytes);
    let expected_data = {
        let mut data = Bytes::new(env);
        data.append(&Bytes::from(asset_id.clone()));
        data.append(&Bytes::from(recipient.clone()));
        data.append(&Bytes::from_array(env, &amount_word));
        data
    };
    for index in 0..list_len(bytes, logs).unwrap_or(0) {
        let log = match list_item(bytes, logs, index) {
            Some(item) => item,
            None => return false,
        };
        let address = match list_item(bytes, log, 0).and_then(|item| payload(bytes, item)) {
            Some(value) => value,
            None => return false,
        };
        if &address != bridge_address {
            continue;
        }
        let topics = match list_item(bytes, log, 1) {
            Some(item) => item,
            None => return false,
        };
        if list_len(bytes, topics).unwrap_or(0) == 0 {
            continue;
        }
        let topic = match list_item(bytes, topics, 0).and_then(|item| payload(bytes, item)) {
            Some(value) => value,
            None => return false,
        };
        if topic != Bytes::from(lock_topic.clone()) {
            continue;
        }
        let data = match list_item(bytes, log, 2).and_then(|item| payload(bytes, item)) {
            Some(value) => value,
            None => return false,
        };
        if data == expected_data {
            return true;
        }
    }
    false
}
