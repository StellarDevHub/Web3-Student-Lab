use soroban_sdk::{contracttype, Address, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AccessPolicy {
    Public,
    Enrolled,
    Restricted,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContentStatus {
    Draft,
    Published,
    Archived,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentMetadata {
    pub title: String,
    pub description: String,
    pub content_type: String,
    pub tags: Vec<String>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentItem {
    pub content_id: u64,
    pub instructor: Address,
    pub metadata: ContentMetadata,
    pub content_hash: String,
    pub version: u32,
    pub status: ContentStatus,
    pub access_policy: AccessPolicy,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    ContentIdCounter,
    Content(u64),
    ContentVersion(u64, u32),
    Instructor(Address),
    Enrollment(u64, Address),
}
