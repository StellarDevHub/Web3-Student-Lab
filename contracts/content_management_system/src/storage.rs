use crate::errors::Error;
use crate::types::{ContentItem, StorageKey};
use soroban_sdk::{Address, Env, String};

const DAY_IN_LEDGERS: u32 = 17280;
const INSTANCE_BUMP_AMOUNT: u32 = 7 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

const PERSISTENT_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - DAY_IN_LEDGERS;

// Admin storage (instance)
pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&StorageKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&StorageKey::Admin, admin);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

pub fn get_admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&StorageKey::Admin)
        .ok_or(Error::NotInitialized)
}

// Content ID counter (instance)
pub fn get_next_content_id(env: &Env) -> u64 {
    let key = StorageKey::ContentIdCounter;
    env.storage().instance().get(&key).unwrap_or(0)
}

pub fn increment_content_id(env: &Env) {
    let key = StorageKey::ContentIdCounter;
    let current = get_next_content_id(env);
    env.storage().instance().set(&key, &(current + 1));
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

// Instructor registry (persistent)
pub fn is_instructor(env: &Env, address: &Address) -> bool {
    let key = StorageKey::Instructor(address.clone());
    env.storage().persistent().get(&key).unwrap_or(false)
}

pub fn set_instructor(env: &Env, address: &Address, is_instructor: bool) {
    let key = StorageKey::Instructor(address.clone());
    env.storage().persistent().set(&key, &is_instructor);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}

// Content storage (persistent)
pub fn save_content(env: &Env, content_id: u64, content: &ContentItem) {
    let key = StorageKey::Content(content_id);
    env.storage().persistent().set(&key, content);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}

pub fn get_content(env: &Env, content_id: u64) -> Result<ContentItem, Error> {
    let key = StorageKey::Content(content_id);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(Error::ContentNotFound)
}

// Content version storage (persistent)
pub fn save_content_version(env: &Env, content_id: u64, version: u32, content_hash: &String) {
    let key = StorageKey::ContentVersion(content_id, version);
    env.storage().persistent().set(&key, content_hash);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}

pub fn get_content_version(env: &Env, content_id: u64, version: u32) -> Result<String, Error> {
    let key = StorageKey::ContentVersion(content_id, version);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(Error::VersionNotFound)
}

// Enrollment storage (persistent)
pub fn is_enrolled(env: &Env, content_id: u64, student: &Address) -> bool {
    let key = StorageKey::Enrollment(content_id, student.clone());
    env.storage().persistent().get(&key).unwrap_or(false)
}

pub fn set_enrollment(env: &Env, content_id: u64, student: &Address, enrolled: bool) {
    let key = StorageKey::Enrollment(content_id, student.clone());
    env.storage().persistent().set(&key, &enrolled);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}
