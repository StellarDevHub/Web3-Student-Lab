use crate::errors::Error;
use crate::storage::{get_content, is_instructor};
use crate::types::StorageKey;
use soroban_sdk::{contracttype, Address, BytesN, Env, symbol_short};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CopyrightRecord {
    pub content_id: u64,
    pub author: Address,
    pub copyright_hash: BytesN<32>,
    pub registered_at: u64,
}

pub fn register_copyright(
    env: &Env,
    author: Address,
    content_id: u64,
    copyright_hash: BytesN<32>,
) -> Result<CopyrightRecord, Error> {
    author.require_auth();

    if !is_instructor(env, &author) {
        return Err(Error::NotInstructor);
    }

    let content = get_content(env, content_id)?;
    if content.instructor != author {
        return Err(Error::Unauthorized);
    }

    let key = StorageKey::Copyright(content_id);
    if env.storage().persistent().has(&key) {
        return Err(Error::CopyrightAlreadyRegistered);
    }

    let record = CopyrightRecord {
        content_id,
        author: author.clone(),
        copyright_hash,
        registered_at: env.ledger().timestamp(),
    };

    env.storage().persistent().set(&key, &record);
    env.events().publish(
        (symbol_short!("copyright"), symbol_short!("register")),
        (content_id, author, record.registered_at),
    );

    Ok(record)
}

pub fn get_copyright(env: &Env, content_id: u64) -> Result<CopyrightRecord, Error> {
    let key = StorageKey::Copyright(content_id);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(Error::ContentNotFound)
}
