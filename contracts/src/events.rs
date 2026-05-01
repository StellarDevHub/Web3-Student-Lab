//! Comprehensive event system for certificate lifecycle tracking.
//!
//! This module defines structured events for all certificate operations,
//! optimized for gas efficiency and easy parsing by indexers.

use soroban_sdk::{
    Address, BytesN, Env, String, Symbol, Vec,
};

/// Certificate event types for on-chain activity logging.
/// Each variant represents a distinct certificate operation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CertificateEvent {
    /// Certificate was minted (issued)
    Minted(CertificateMintedEvent),
    /// Certificate was transferred between addresses
    Transferred(CertificateTransferredEvent),
    /// Certificate was revoked by an authority
    Revoked(CertificateRevokedEvent),
    /// Certificate was verified (validation check performed)
    Verified(CertificateVerifiedEvent),
    /// Certificate metadata was updated
    Updated(CertificateUpdatedEvent),
    /// Multiple certificates were minted in a batch
    BatchMinted(CertificateBatchMintedEvent),
    /// Certificate was renewed (TTL extended)
    Renewed(CertificateRenewedEvent),
}

/// Event data for certificate minting.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateMintedEvent {
    pub token_id: u128,
    pub recipient: Address,
    pub course_id: BytesN<32>,
    pub metadata_hash: BytesN<32>,
    pub minted_at: u64,
    pub minted_by: Address,
}

/// Event data for certificate transfers.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateTransferredEvent {
    pub token_id: u128,
    pub from: Address,
    pub to: Address,
    pub transferred_at: u64,
}

/// Event data for certificate revocation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateRevokedEvent {
    pub token_id: u128,
    pub revoked_by: Address,
    pub reason: u32,
    pub revoked_at: u64,
}

/// Event data for certificate verification.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateVerifiedEvent {
    pub token_id: u128,
    pub verified_by: Address,
    pub verification_method: u32,
    pub verified_at: u64,
}

/// Event data for certificate metadata updates.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateUpdatedEvent {
    pub token_id: u128,
    pub updated_by: Address,
    pub field_mask: u32,
    pub updated_at: u64,
}

/// Event data for batch minting operations.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateBatchMintedEvent {
    pub token_ids: Vec<u128>,
    pub course_id: BytesN<32>,
    pub count: u32,
    pub minted_at: u64,
    pub minted_by: Address,
}

/// Event data for certificate renewal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateRenewedEvent {
    pub token_id: u128,
    pub renewed_by: Address,
    pub renewed_at: u64,
    pub new_expiry: u64,
}

/// Event publisher helper functions.
pub struct EventPublisher<'a> {
    env: &'a Env,
    contract_address: Address,
}

impl<'a> EventPublisher<'a> {
    /// Create a new EventPublisher.
    pub fn new(env: &'a Env, contract_address: Address) -> Self {
        Self { env, contract_address }
    }

    /// Publish a certificate minted event.
    pub fn publish_minted(
        &self,
        token_id: u128,
        recipient: &Address,
        course_id: BytesN<32>,
        metadata_hash: BytesN<32>,
        minted_by: &Address,
    ) {
        let event = CertificateMintedEvent {
            token_id,
            recipient: recipient.clone(),
            course_id,
            metadata_hash,
            minted_at: self.env.ledger().timestamp(),
            minted_by: minted_by.clone(),
        };

        self.env.events().publish(
            (
                Symbol::new(self.env, "cert_minted"),
                Symbol::new(self.env, "v2"),
            ),
            (token_id, recipient.clone(), course_id, metadata_hash, event.minted_at, minted_by.clone()),
        );
    }

    /// Publish a certificate revoked event.
    pub fn publish_revoked(
        &self,
        token_id: u128,
        revoked_by: &Address,
        reason: u32,
    ) {
        let event = CertificateRevokedEvent {
            token_id,
            revoked_by: revoked_by.clone(),
            reason,
            revoked_at: self.env.ledger().timestamp(),
        };

        self.env.events().publish(
            (
                Symbol::new(self.env, "cert_revoked"),
                Symbol::new(self.env, "v2"),
            ),
            (token_id, revoked_by.clone(), reason, event.revoked_at),
        );
    }

    /// Publish a batch minted event.
    pub fn publish_batch_minted(
        &self,
        token_ids: Vec<u128>,
        course_id: BytesN<32>,
        count: u32,
        minted_by: &Address,
    ) {
        let event = CertificateBatchMintedEvent {
            minted_at: self.env.ledger().timestamp(),
            minted_by: minted_by.clone(),
            token_ids: token_ids.clone(),
            course_id,
            count,
        };

        self.env.events().publish(
            (
                Symbol::new(self.env, "batch_minted"),
                Symbol::new(self.env, "v2"),
            ),
            (token_ids, course_id, count, event.minted_at, minted_by.clone()),
        );
    }

    /// Publish a certificate renewed event.
    pub fn publish_renewed(
        &self,
        token_id: u128,
        renewed_by: &Address,
        new_expiry: u64,
    ) {
        let event = CertificateRenewedEvent {
            token_id,
            renewed_by: renewed_by.clone(),
            renewed_at: self.env.ledger().timestamp(),
            new_expiry,
        };

        self.env.events().publish(
            (
                Symbol::new(self.env, "cert_renewed"),
                Symbol::new(self.env, "v2"),
            ),
            (token_id, renewed_by.clone(), event.renewed_at, new_expiry),
        );
    }

    /// Publish a role granted event.
    pub fn publish_role_granted(&self, caller: &Address, account: &Address, role: u32) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "role_granted"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), account.clone(), role),
        );
    }

    /// Publish a role revoked event.
    pub fn publish_role_revoked(&self, caller: &Address, account: &Address) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "role_revoked"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), account.clone()),
        );
    }

    /// Publish a pause updated event.
    pub fn publish_pause_updated(&self, caller: &Address, paused: bool) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "pause_updated"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), paused),
        );
    }

    /// Publish an action proposed event.
    pub fn publish_action_proposed(&self, caller: &Address, proposal_id: u64) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "action_proposed"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), proposal_id),
        );
    }

    /// Publish an action approved event.
    pub fn publish_action_approved(&self, caller: &Address, proposal_id: u64) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "action_approved"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), proposal_id),
        );
    }

    /// Publish an action executed event.
    pub fn publish_action_executed(&self, caller: &Address, proposal_id: u64) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "action_executed"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), proposal_id),
        );
    }

    /// Publish a mint cap updated event.
    pub fn publish_mint_cap_updated(&self, old_cap: u32, new_cap: u32) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "mint_cap_updated"),
                Symbol::new(self.env, "v2"),
            ),
            (old_cap, new_cap),
        );
    }

    /// Publish a DID updated event.
    pub fn publish_did_updated(&self, caller: &Address, did: &String, timestamp: u64) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "did_updated"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), did.clone(), timestamp),
        );
    }

    /// Publish a DID removed event.
    pub fn publish_did_removed(&self, caller: &Address, student: &Address) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "did_removed"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), student.clone()),
        );
    }

    /// Publish an upgrade proposed event.
    pub fn publish_upgrade_proposed(&self, caller: &Address, wasm_hash: BytesN<32>, changelog: &String) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "upgrade_proposed"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), wasm_hash, changelog.clone()),
        );
    }

    /// Publish an upgrade approved event.
    pub fn publish_upgrade_approved(&self, caller: &Address, approval_mask: u32) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "upgrade_approved"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), approval_mask),
        );
    }

    /// Publish an upgrade executed event.
    pub fn publish_upgrade_executed(&self, caller: &Address, wasm_hash: BytesN<32>) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "upgrade_executed"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), wasm_hash),
        );
    }

    /// Publish an upgrade cancelled event.
    pub fn publish_upgrade_cancelled(&self, caller: &Address) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "upgrade_cancelled"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(),),
        );
    }

    /// Publish a proposal created event.
    pub fn publish_proposal_created(&self, creator: &Address, proposal_id: u64, title: &String) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "proposal_created"),
                Symbol::new(self.env, "v2"),
            ),
            (creator.clone(), proposal_id, title.clone()),
        );
    }

    /// Publish a vote cast event.
    pub fn publish_vote_cast(&self, user: &Address, proposal_id: u64, votes: i128, cost: u128) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "vote_cast"),
                Symbol::new(self.env, "v2"),
            ),
            (user.clone(), proposal_id, votes, cost),
        );
    }

    /// Publish a proposal executed event.
    pub fn publish_proposal_executed(&self, proposal_id: u64, status: u32) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "proposal_executed"),
                Symbol::new(self.env, "v2"),
            ),
            (proposal_id, status),
        );
    }

    /// Publish an identity verified event.
    pub fn publish_identity_verified(&self, student: &Address, did: &String) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "identity_verified"),
                Symbol::new(self.env, "v2"),
            ),
            (student.clone(), did.clone()),
        );
    }

    /// Publish an emergency rollback event.
    pub fn publish_emergency_rollback(&self, signer_a: &Address, signer_b: &Address, target_version: u32, wasm_hash: BytesN<32>) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "emergency_rollback"),
                Symbol::new(self.env, "v2"),
            ),
            (signer_a.clone(), signer_b.clone(), target_version, wasm_hash),
        );
    }

    /// Publish an admin added event.
    pub fn publish_admin_added(&self, caller: &Address, new_admin: &Address, role: u32) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "admin_added"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), new_admin.clone(), role),
        );
    }

    /// Publish an admin removed event.
    pub fn publish_admin_removed(&self, caller: &Address, admin_to_remove: &Address) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "admin_removed"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), admin_to_remove.clone()),
        );
    }

    /// Publish an ownership transferred event.
    pub fn publish_ownership_transferred(&self, caller: &Address, new_owner: &Address) {
        self.env.events().publish(
            (
                Symbol::new(self.env, "ownership_transferred"),
                Symbol::new(self.env, "v2"),
            ),
            (caller.clone(), new_owner.clone()),
        );
    }

    /// Publish a batch minted event.
    pub fn publish_batch_minted(&self, token_ids: Vec<u128>, course_id: BytesN<32>, count: u32, minted_by: &Address) {
        let event = CertificateBatchMintedEvent {
            token_ids: token_ids.clone(),
            course_id,
            count,
            minted_at: self.env.ledger().timestamp(),
            minted_by: minted_by.clone(),
        };
        self.env.events().publish(
            (
                Symbol::new(self.env, "batch_minted"),
                Symbol::new(self.env, "v2"),
            ),
            (token_ids, course_id, count, event.minted_at, minted_by.clone()),
        );
    }

    /// Publish a certificate renewed event.
    pub fn publish_renewed(&self, token_id: u128, renewed_by: &Address, new_expiry: u64) {
        let event = CertificateRenewedEvent {
            token_id,
            renewed_by: renewed_by.clone(),
            renewed_at: self.env.ledger().timestamp(),
            new_expiry,
        };
        self.env.events().publish(
            (
                Symbol::new(self.env, "cert_renewed"),
                Symbol::new(self.env, "v2"),
            ),
            (token_id, renewed_by.clone(), event.renewed_at, new_expiry),
        );
    }
}

/// Event recorder that emits v2 events for the contract.
pub struct EventRecorder<'a> {
    env: &'a Env,
    contract_address: Address,
    publisher: EventPublisher<'a>,
}

impl<'a> EventRecorder<'a> {
    pub fn new(env: &'a Env, contract_address: Address) -> Self {
        Self {
            env,
            contract_address,
            publisher: EventPublisher::new(env, contract_address),
        }
    }

    /// Record a certificate minted event.
    pub fn record_minted(&self, token_id: u128, recipient: &Address, course_id: BytesN<32>, metadata_hash: BytesN<32>, minted_by: &Address) {
        self.publisher.publish_minted(token_id, recipient, course_id, metadata_hash, minted_by);
    }

    /// Record a certificate revoked event.
    pub fn record_revoked(&self, token_id: u128, revoked_by: &Address, reason: u32) {
        self.publisher.publish_revoked(token_id, revoked_by, reason);
    }

    /// Record a batch minted event.
    pub fn record_batch_minted(&self, token_ids: Vec<u128>, course_id: BytesN<32>, count: u32, minted_by: &Address) {
        self.publisher.publish_batch_minted(token_ids, course_id, count, minted_by);
    }

    /// Record a certificate renewed event.
    pub fn record_renewed(&self, token_id: u128, renewed_by: &Address, new_expiry: u64) {
        self.publisher.publish_renewed(token_id, renewed_by, new_expiry);
    }
}

/// Helper function to generate a unique token ID from course symbol and student address.
/// This is a simple hash combining the course symbol string and student address.
pub fn generate_token_id(env: &Env, course_symbol: &Symbol, student: &Address) -> u128 {
    let course_str = course_symbol.to_string();
    let course_bytes = course_str.as_bytes();
    let student_bytes = student.to_xdr(env);

    let mut hash: u128 = 0;
    for &b in course_bytes.iter() {
        hash = hash.wrapping_mul(31).wrapping_add(b as u128);
    }
    for &b in student_bytes.iter() {
        hash = hash.wrapping_mul(31).wrapping_add(b as u128);
    }

    hash
}

/// Helper function to compute metadata hash for certificate.
pub fn compute_metadata_hash(
    env: &Env,
    course_name: &String,
    grade: &Option<String>,
    did: &Option<String>,
) -> BytesN<32> {
    let mut hasher = env.crypto().hasher();

    hasher.update(course_name.as_bytes());
    if let Some(grade) = grade {
        hasher.update(grade.as_bytes());
    }
    if let Some(did) = did {
        hasher.update(did.as_bytes());
    }

    hasher.finalize()
}
