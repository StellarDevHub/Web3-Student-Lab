// Decentralized Identity (DID) Registry Contract — `did:stellar` method
// Language: Rust (Soroban)
//
// This contract is the on-chain anchor for the `did:stellar` and `did:soroban`
// DID method identifiers and returns DID Core-compatible resolution records:
//
//   * The DID identifier is the 32-byte Stellar Ed25519 account id
//     (`did:stellar:<hex>`).
//   * The registry stores the controller `Address`, an off-chain GitHub
//     handle binding, the Ed25519 *verification key* used to sign contributor
//     proofs, and the set of verified contributor claims.
//
// Contributor proof signatures are verified by the off-chain resolver. Key
// rotation signatures are verified on-chain against the separately configured
// recovery key.

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Map, String, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DidError {
    Unauthorized = 1,
    NotFound = 2,
    AlreadyRegistered = 3,
    Revoked = 4,
    InvalidInput = 5,
    Overflow = 6,
    RecoveryKeyNotSet = 7,
}

/// A single signed contributor proof claim (PR or issue milestone).
#[derive(Clone)]
#[contracttype]
pub struct ContributorProof {
    /// Kind of contribution: "pr" or "issue".
    pub claim_type: String,
    /// GitHub repository, e.g. "StellarDevHub/Web3-Student-Lab".
    pub repo: String,
    /// Identifier of the PR/issue (number or node id).
    pub item_id: String,
    /// GitHub handle of the contributor (must match the bound handle).
    pub github_handle: String,
    /// Unix timestamp (seconds) the claim was issued.
    pub issued_at: u64,
    /// Raw Ed25519 signature bytes over the canonical claim payload.
    pub signature: Bytes,
}

#[derive(Clone)]
#[contracttype]
pub struct DIDDocument {
    pub owner: Address,
    /// Off-chain GitHub handle bound to this DID.
    pub github_handle: Option<String>,
    /// Social handles keyed by provider symbol (github or discord).
    pub social_identities: Map<Symbol, String>,
    /// Ed25519 verification key (32 bytes) used to sign contributor proofs.
    pub verification_key: Option<BytesN<32>>,
    /// Recovery key used to authorize verification-key rotations.
    pub recovery_key: Option<BytesN<32>>,
    /// Previously active Ed25519 verification keys, in rotation order.
    pub historical_verification_keys: Vec<BytesN<32>>,
    /// Monotonic nonce included in signed key-rotation payloads.
    pub key_rotation_nonce: u32,
    pub attributes: Map<Symbol, Bytes>,
    pub services: Vec<ServiceEndpoint>,
    pub controllers: Vec<Address>,
    pub revoked: bool,
    /// Stored contributor proofs (mirror of on-chain claims).
    pub proofs: Vec<ContributorProof>,
}

/// W3C DID Core verification method using the Ed25519 2020 multibase encoding.
#[derive(Clone)]
#[contracttype]
pub struct VerificationMethod {
    pub id: String,
    pub r#type: String,
    pub controller: String,
    pub public_key_multibase: String,
}

/// W3C DID Core service entry.
#[derive(Clone)]
#[contracttype]
pub struct ServiceEndpoint {
    pub id: String,
    pub r#type: String,
    pub service_endpoint: String,
}

/// DID Core representation returned by the method-specific resolution calls.
#[derive(Clone)]
#[contracttype]
pub struct W3CDIDDocument {
    /// Serialized by resolvers as the DID Core `@context` property.
    pub context: Vec<String>,
    pub id: String,
    pub verification_method: Vec<VerificationMethod>,
    pub authentication: Vec<String>,
    pub assertion_method: Vec<String>,
    pub capability_invocation: Vec<String>,
    pub service: Vec<ServiceEndpoint>,
}

#[contracttype]
pub enum DataKey {
    DIDs,
    /// Map<BytesN<32>, Vec<ContributorProof>> — claims per DID.
    Proofs,
}

#[contract]
pub struct DIDRegistryContract;

#[contractimpl]
impl DIDRegistryContract {
    pub fn register(env: Env, owner: Address, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        owner.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        if dids.contains_key(did.clone()) {
            panic_with_error!(&env, DidError::AlreadyRegistered);
        }
        let doc = DIDDocument {
            owner: owner.clone(),
            github_handle: None,
            social_identities: Map::new(&env),
            verification_key: None,
            recovery_key: None,
            historical_verification_keys: Vec::new(&env),
            key_rotation_nonce: 0,
            attributes,
            services: Vec::new(&env),
            controllers: Vec::new(&env),
            revoked: false,
            proofs: Vec::new(&env),
        };
        dids.set(did.clone(), doc);
        let mut proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        proofs.set(did.clone(), Vec::new(&env));
        env.storage().persistent().set(&DataKey::DIDs, &dids);
        env.storage().persistent().set(&DataKey::Proofs, &proofs);
    }

    /// Bind an off-chain GitHub handle to the DID. Only the owner may bind.
    pub fn bind_github(env: Env, sender: Address, did: BytesN<32>, handle: String) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        doc.github_handle = Some(handle);
        doc.social_identities.set(
            Symbol::new(&env, "github"),
            doc.github_handle.clone().unwrap(),
        );
        dids.set(did.clone(), doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Bind a social handle to the DID. Only the owner may bind; verifiers must
    /// separately validate the provider proof associated with the handle.
    pub fn bind_social(
        env: Env,
        sender: Address,
        did: BytesN<32>,
        provider: Symbol,
        handle: String,
    ) {
        sender.require_auth();
        if provider != Symbol::new(&env, "github") && provider != Symbol::new(&env, "discord") {
            panic_with_error!(&env, DidError::InvalidInput);
        }
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        if provider == Symbol::new(&env, "github") {
            doc.github_handle = Some(handle.clone());
        }
        doc.social_identities.set(provider, handle);
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Set the Ed25519 verification key used to sign contributor proofs.
    pub fn set_verification_key(env: Env, sender: Address, did: BytesN<32>, key: BytesN<32>) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender || doc.verification_key.is_some() {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        doc.verification_key = Some(key);
        dids.set(did.clone(), doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Set or replace the recovery key. Replacing it requires owner auth.
    pub fn set_recovery_key(env: Env, sender: Address, did: BytesN<32>, key: BytesN<32>) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        doc.recovery_key = Some(key);
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Return the exact domain-separated payload that a recovery key must sign.
    pub fn key_rotation_payload(env: Env, did: BytesN<32>, new_key: BytesN<32>) -> Bytes {
        let dids = read_dids(&env);
        let doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        rotation_payload(&env, &did, &doc, &new_key)
            .unwrap_or_else(|| panic_with_error!(&env, DidError::RecoveryKeyNotSet))
    }

    /// Rotate the signing key with an Ed25519 signature from the recovery key.
    pub fn rotate_verification_key(
        env: Env,
        did: BytesN<32>,
        new_key: BytesN<32>,
        signature: BytesN<64>,
    ) {
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        let recovery_key = doc
            .recovery_key
            .clone()
            .unwrap_or_else(|| panic_with_error!(&env, DidError::RecoveryKeyNotSet));
        if doc.verification_key.as_ref() == Some(&new_key) {
            panic_with_error!(&env, DidError::InvalidInput);
        }
        let payload = rotation_payload(&env, &did, &doc, &new_key)
            .unwrap_or_else(|| panic_with_error!(&env, DidError::RecoveryKeyNotSet));
        env.crypto()
            .ed25519_verify(&recovery_key, &payload, &signature);

        if let Some(current_key) = doc.verification_key.replace(new_key) {
            doc.historical_verification_keys.push_back(current_key);
        }
        doc.key_rotation_nonce = doc
            .key_rotation_nonce
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, DidError::Overflow));
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Add a service endpoint to the DID document (DID controller only).
    pub fn add_service(
        env: Env,
        sender: Address,
        did: BytesN<32>,
        service_id: String,
        service_type: String,
        endpoint: String,
    ) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        if service_id.len() < 2
            || service_id.len() > 64
            || service_type.len() == 0
            || endpoint.len() == 0
        {
            panic_with_error!(&env, DidError::InvalidInput);
        }
        let service_id_bytes = service_id.to_bytes();
        if service_id_bytes.get(0) != Some(b'#') {
            panic_with_error!(&env, DidError::InvalidInput);
        }
        for index in 1..service_id.len() {
            let byte = service_id_bytes.get(index).unwrap_or(0);
            if !byte.is_ascii_alphanumeric() && !matches!(byte, b'-' | b'.' | b'_' | b'~') {
                panic_with_error!(&env, DidError::InvalidInput);
            }
        }
        if doc.services.iter().any(|entry| entry.id == service_id) {
            panic_with_error!(&env, DidError::InvalidInput);
        }
        doc.services.push_back(ServiceEndpoint {
            id: service_id,
            r#type: service_type,
            service_endpoint: endpoint,
        });
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Append a signed contributor proof claim. Only the owner may add; the
    /// resolver performs the cryptographic verification off-chain.
    pub fn add_contributor_proof(
        env: Env,
        sender: Address,
        did: BytesN<32>,
        proof: ContributorProof,
    ) {
        sender.require_auth();
        let dids = read_dids(&env);
        let doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender && !doc.controllers.contains(&sender) {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        if let Some(handle) = doc.github_handle.clone() {
            assert!(
                handle == proof.github_handle,
                "Proof handle must match bound handle"
            );
        }
        let mut proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        let mut list = proofs.get(did.clone()).unwrap_or_else(|| Vec::new(&env));
        list.push_back(proof);
        proofs.set(did.clone(), list);
        env.storage().persistent().set(&DataKey::Proofs, &proofs);
    }

    pub fn update(env: Env, sender: Address, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender && !doc.controllers.contains(&sender) {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        doc.attributes = attributes;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn rotate_key(env: Env, sender: Address, did: BytesN<32>, new_owner: Address) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        doc.owner = new_owner;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn revoke(env: Env, sender: Address, did: BytesN<32>) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        doc.revoked = true;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn add_controller(env: Env, sender: Address, did: BytesN<32>, controller: Address) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        if !doc.controllers.contains(&controller) {
            doc.controllers.push_back(controller);
        }
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn remove_controller(env: Env, sender: Address, did: BytesN<32>, controller: Address) {
        sender.require_auth();
        let mut dids = read_dids(&env);
        let mut doc = read_doc(&env, &dids, &did);
        ensure_active(&env, &doc);
        if doc.owner != sender {
            panic_with_error!(&env, DidError::Unauthorized);
        }
        let idx = doc.controllers.iter().position(|c| c == controller);
        if let Some(i) = idx {
            doc.controllers.remove(i as u32);
        }
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn resolve(env: Env, did: BytesN<32>) -> Option<DIDDocument> {
        let dids = read_dids(&env);
        let mut doc = dids.get(did.clone())?;
        let proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        doc.proofs = proofs.get(did).unwrap_or_else(|| Vec::new(&env));
        Some(doc)
    }

    /// Resolve a DID Core document using the `did:stellar` method identifier.
    pub fn resolve_stellar(env: Env, did: BytesN<32>) -> Option<W3CDIDDocument> {
        let dids = read_dids(&env);
        let doc = dids.get(did.clone())?;
        Some(w3c_document(&env, &did, &doc, stellar_did(&env, &did)))
    }

    /// Resolve a DID Core document using `did:soroban:<network>:<identifier>`.
    pub fn resolve_soroban(env: Env, did: BytesN<32>, network: String) -> Option<W3CDIDDocument> {
        if !valid_network(&network) {
            panic_with_error!(&env, DidError::InvalidInput);
        }
        let dids = read_dids(&env);
        let doc = dids.get(did.clone())?;
        Some(w3c_document(
            &env,
            &did,
            &doc,
            soroban_did(&env, &did, &network),
        ))
    }

    /// Returns the bound GitHub handle for a DID, if any.
    pub fn get_github_handle(env: Env, did: BytesN<32>) -> Option<String> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        dids.get(did).and_then(|d| d.github_handle)
    }

    /// Returns a verified social handle for a DID and provider, if any.
    pub fn get_social_handle(env: Env, did: BytesN<32>, provider: Symbol) -> Option<String> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        dids.get(did)
            .and_then(|doc| doc.social_identities.get(provider))
    }

    /// Returns the Ed25519 verification key for a DID, if set.
    pub fn get_verification_key(env: Env, did: BytesN<32>) -> Option<BytesN<32>> {
        let dids = read_dids(&env);
        dids.get(did).and_then(|d| d.verification_key)
    }

    /// Returns all stored contributor proofs for a DID.
    pub fn get_proofs(env: Env, did: BytesN<32>) -> Vec<ContributorProof> {
        let proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        proofs.get(did).unwrap_or_else(|| Vec::new(&env))
    }
}

fn read_dids(env: &Env) -> Map<BytesN<32>, DIDDocument> {
    env.storage()
        .persistent()
        .get(&DataKey::DIDs)
        .unwrap_or_else(|| Map::new(env))
}

fn read_doc(env: &Env, dids: &Map<BytesN<32>, DIDDocument>, did: &BytesN<32>) -> DIDDocument {
    dids.get(did.clone())
        .unwrap_or_else(|| panic_with_error!(env, DidError::NotFound))
}

fn ensure_active(env: &Env, doc: &DIDDocument) {
    if doc.revoked {
        panic_with_error!(env, DidError::Revoked);
    }
}

fn rotation_payload(
    env: &Env,
    did: &BytesN<32>,
    doc: &DIDDocument,
    new_key: &BytesN<32>,
) -> Option<Bytes> {
    let current_key = doc.verification_key.as_ref()?;
    let network_id = env.ledger().network_id();
    let mut payload = Bytes::from_slice(env, b"did-registry:key-rotation:v1:");
    payload.append(&env.current_contract_address().to_string().to_bytes());
    payload.append(&Bytes::from_slice(env, b":"));
    payload.append(&Bytes::from_slice(env, &network_id.to_array()));
    payload.append(&Bytes::from_slice(env, &did.to_array()));
    payload.append(&Bytes::from_slice(env, &current_key.to_array()));
    payload.append(&Bytes::from_slice(env, &new_key.to_array()));
    payload.append(&Bytes::from_slice(
        env,
        &doc.key_rotation_nonce.to_be_bytes(),
    ));
    Some(payload)
}

fn stellar_did(env: &Env, did: &BytesN<32>) -> String {
    make_did_string(env, b"did:stellar:", None, did)
}

fn soroban_did(env: &Env, did: &BytesN<32>, network: &String) -> String {
    make_did_string(env, b"did:soroban:", Some(network), did)
}

fn make_did_string(env: &Env, prefix: &[u8], network: Option<&String>, did: &BytesN<32>) -> String {
    let mut result = [0u8; 128];
    let mut len = prefix.len();
    result[..len].copy_from_slice(prefix);
    if let Some(network) = network {
        let network_len = network.len() as usize;
        network.copy_into_slice(&mut result[len..len + network_len]);
        len += network_len;
        result[len] = b':';
        len += 1;
    }
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in did.to_array() {
        result[len] = HEX[(byte >> 4) as usize];
        result[len + 1] = HEX[(byte & 0x0f) as usize];
        len += 2;
    }
    String::from_bytes(env, &result[..len])
}

fn w3c_document(
    env: &Env,
    did: &BytesN<32>,
    doc: &DIDDocument,
    identifier: String,
) -> W3CDIDDocument {
    let mut context = Vec::new(env);
    context.push_back(String::from_str(env, "https://www.w3.org/ns/did/v1"));
    context.push_back(String::from_str(
        env,
        "https://w3id.org/security/suites/ed25519-2020/v1",
    ));

    let mut verification_method = Vec::new(env);
    let mut authentication = Vec::new(env);
    let mut assertion_method = Vec::new(env);
    for (index, key) in doc.historical_verification_keys.iter().enumerate() {
        let method_id = key_method_id(env, &identifier, index as u32 + 1);
        verification_method.push_back(verification_method_entry(env, &identifier, &method_id, key));
    }
    if let Some(current_key) = doc.verification_key.as_ref() {
        let current_method_id =
            key_method_id(env, &identifier, doc.historical_verification_keys.len() + 1);
        verification_method.push_back(verification_method_entry(
            env,
            &identifier,
            &current_method_id,
            current_key,
        ));
        authentication.push_back(current_method_id.clone());
        assertion_method.push_back(current_method_id);
    }

    let mut capability_invocation = Vec::new(env);
    if let Some(recovery_key) = doc.recovery_key.as_ref() {
        let recovery_method_id = recovery_method_id(env, &identifier);
        verification_method.push_back(verification_method_entry(
            env,
            &identifier,
            &recovery_method_id,
            recovery_key,
        ));
        capability_invocation.push_back(recovery_method_id);
    }

    W3CDIDDocument {
        context,
        id: identifier,
        verification_method,
        authentication,
        assertion_method,
        capability_invocation,
        service: absolute_services(env, &identifier, &doc.services),
    }
}

fn absolute_services(
    env: &Env,
    did: &String,
    services: &Vec<ServiceEndpoint>,
) -> Vec<ServiceEndpoint> {
    let mut resolved = Vec::new(env);
    for service in services.iter() {
        let mut id = [0u8; 192];
        let did_len = did.len() as usize;
        did.copy_into_slice(&mut id[..did_len]);
        let fragment_len = service.id.len() as usize;
        service
            .id
            .copy_into_slice(&mut id[did_len..did_len + fragment_len]);
        resolved.push_back(ServiceEndpoint {
            id: String::from_bytes(env, &id[..did_len + fragment_len]),
            r#type: service.r#type,
            service_endpoint: service.service_endpoint,
        });
    }
    resolved
}

fn verification_method_entry(
    env: &Env,
    controller: &String,
    method_id: &String,
    key: &BytesN<32>,
) -> VerificationMethod {
    VerificationMethod {
        id: method_id.clone(),
        r#type: String::from_str(env, "Ed25519VerificationKey2020"),
        controller: controller.clone(),
        public_key_multibase: ed25519_multibase(env, key),
    }
}

fn key_method_id(env: &Env, did: &String, index: u32) -> String {
    let mut output = [0u8; 160];
    let did_len = did.len() as usize;
    did.copy_into_slice(&mut output[..did_len]);
    let mut digits = [0u8; 10];
    let mut value = index;
    let mut digit_len = 0usize;
    while value > 0 {
        digits[digit_len] = b'0' + (value % 10) as u8;
        digit_len += 1;
        value /= 10;
    }
    let mut len = did_len;
    output[len..len + 5].copy_from_slice(b"#key-");
    len += 5;
    for digit in digits[..digit_len].iter().rev() {
        output[len] = *digit;
        len += 1;
    }
    String::from_bytes(env, &output[..len])
}

fn recovery_method_id(env: &Env, did: &String) -> String {
    let mut output = [0u8; 160];
    let did_len = did.len() as usize;
    did.copy_into_slice(&mut output[..did_len]);
    output[did_len..did_len + 13].copy_from_slice(b"#recovery-key");
    String::from_bytes(env, &output[..did_len + 13])
}

fn ed25519_multibase(env: &Env, key: &BytesN<32>) -> String {
    const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut input = [0u8; 34];
    input[0] = 0xed;
    input[1] = 0x01;
    input[2..].copy_from_slice(&key.to_array());

    let mut digits = [0u8; 47];
    let mut digit_len = 0usize;
    for byte in input {
        let mut carry = byte as u32;
        for digit in digits[..digit_len].iter_mut() {
            carry += (*digit as u32) << 8;
            *digit = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits[digit_len] = (carry % 58) as u8;
            digit_len += 1;
            carry /= 58;
        }
    }

    let mut encoded = [0u8; 48];
    encoded[0] = b'z';
    let mut len = 1usize;
    for digit in digits[..digit_len].iter().rev() {
        encoded[len] = ALPHABET[*digit as usize];
        len += 1;
    }
    String::from_bytes(env, &encoded[..len])
}

fn valid_network(network: &String) -> bool {
    let len = network.len() as usize;
    if len == 0 || len > 32 {
        return false;
    }
    let mut bytes = [0u8; 32];
    network.copy_into_slice(&mut bytes[..len]);
    bytes[..len].iter().all(|byte| {
        byte.is_ascii_lowercase()
            || byte.is_ascii_uppercase()
            || byte.is_ascii_digit()
            || *byte == b'-'
    })
}

#[cfg(test)]
#[path = "test.rs"]
mod integration_tests;

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{symbol_short, testutils::Address as _, BytesN, Env};

    #[test]
    fn test_did_registry_flow() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(DIDRegistryContract, ());
        let client = DIDRegistryContractClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let did = BytesN::from_array(&env, &[1u8; 32]);
        let mut attrs = Map::new(&env);
        attrs.set(symbol_short!("name"), Bytes::from_slice(&env, b"Alice"));

        client.register(&owner, &did, &attrs);
        let doc = client.resolve(&did).unwrap();
        assert_eq!(doc.owner, owner);

        // Bind github + verification key
        let handle = String::from_str(&env, "alice");
        client.bind_github(&owner, &did, &handle);
        let discord_handle = String::from_str(&env, "alice#1234");
        client.bind_social(&owner, &did, &Symbol::new(&env, "discord"), &discord_handle);
        let key = BytesN::from_array(&env, &[9u8; 32]);
        client.set_verification_key(&owner, &did, &key);

        let doc = client.resolve(&did).unwrap();
        assert_eq!(doc.github_handle, Some(handle));
        assert_eq!(
            client.get_social_handle(&did, &Symbol::new(&env, "discord")),
            Some(discord_handle)
        );
        assert_eq!(doc.verification_key, Some(key));

        // Add a contributor proof
        let proof = ContributorProof {
            claim_type: String::from_str(&env, "pr"),
            repo: String::from_str(&env, "StellarDevHub/Web3-Student-Lab"),
            item_id: String::from_str(&env, "123"),
            github_handle: String::from_str(&env, "alice"),
            issued_at: 1_700_000_000,
            signature: Bytes::from_slice(&env, &[0u8; 64]),
        };
        client.add_contributor_proof(&owner, &did, &proof);
        assert_eq!(client.get_proofs(&did).len(), 1);

        // Handle mismatch must be rejected
        let bad_proof = ContributorProof {
            claim_type: String::from_str(&env, "pr"),
            repo: String::from_str(&env, "x/y"),
            item_id: String::from_str(&env, "1"),
            github_handle: String::from_str(&env, "mallory"),
            issued_at: 1,
            signature: Bytes::from_slice(&env, &[0u8; 64]),
        };
        let result = client.try_add_contributor_proof(&owner, &did, &bad_proof);
        assert!(result.is_err(), "proof with wrong handle must be rejected");

        // Key rotation
        let new_owner = Address::generate(&env);
        client.rotate_key(&owner, &did, &new_owner);
        let doc = client.resolve(&did).unwrap();
        assert_eq!(doc.owner, new_owner);

        // Revoke
        client.revoke(&new_owner, &did);
        let doc = client.resolve(&did).unwrap();
        assert!(doc.revoked);
    }
}
