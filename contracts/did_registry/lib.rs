// Decentralized Identity (DID) Registry Contract
// Language: Rust (Soroban)

#![no_std]
use soroban_sdk::{contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, Symbol, Vec};

#[derive(Clone)]
#[contracttype]
pub struct DIDDocument {
    pub owner: Address,
    pub attributes: Map<Symbol, Bytes>,
    pub controllers: Vec<Address>,
    pub revoked: bool,
}

#[contracttype]
pub enum DataKey {
    DIDs,
}

pub struct DIDRegistryContract;

#[contractimpl]
impl DIDRegistryContract {
    pub fn register(env: Env, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        let owner = env.invoker();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().get(&DataKey::DIDs).unwrap_or_default();
        assert!(!dids.contains_key(&did), "DID already registered");
        let doc = DIDDocument {
            owner: owner.clone(),
            attributes,
            controllers: Vec::new(&env),
            revoked: false,
        };
        dids.set(did, doc);
        env.storage().set(&DataKey::DIDs, &dids);
    }

    pub fn update(env: Env, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        let sender = env.invoker();
        let mut dids: Map<BytesN<32>, DIDDocument> = env.storage().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(
            doc.owner == sender || doc.controllers.contains(&sender),
            "Not authorized"
        );
        doc.attributes = attributes;
        dids.set(did, doc);
        env.storage().set(&DataKey::DIDs, &dids);
    }

    pub fn rotate_key(env: Env, did: BytesN<32>, new_owner: Address) {
        let sender = env.invoker();
        let mut dids: Map<BytesN<32>, DIDDocument> = env.storage().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(doc.owner == sender, "Only owner can rotate key");
        doc.owner = new_owner;
        dids.set(did, doc);
        env.storage().set(&DataKey::DIDs, &dids);
    }

    pub fn revoke(env: Env, did: BytesN<32>) {
        let sender = env.invoker();
        let mut dids: Map<BytesN<32>, DIDDocument> = env.storage().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can revoke");
        doc.revoked = true;
        dids.set(did, doc);
        env.storage().set(&DataKey::DIDs, &dids);
    }

    pub fn add_controller(env: Env, did: BytesN<32>, controller: Address) {
        let sender = env.invoker();
        let mut dids: Map<BytesN<32>, DIDDocument> = env.storage().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can add controller");
        if !doc.controllers.contains(&controller) {
            doc.controllers.push_back(controller);
        }
        dids.set(did, doc);
        env.storage().set(&DataKey::DIDs, &dids);
    }

    pub fn remove_controller(env: Env, did: BytesN<32>, controller: Address) {
        let sender = env.invoker();
        let mut dids: Map<BytesN<32>, DIDDocument> = env.storage().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can remove controller");
        let idx = doc.controllers.iter().position(|c| c == &controller);
        if let Some(i) = idx {
            doc.controllers.remove(i as u32);
        }
        dids.set(did, doc);
        env.storage().set(&DataKey::DIDs, &dids);
    }

    pub fn resolve(env: Env, did: BytesN<32>) -> Option<DIDDocument> {
        let dids: Map<BytesN<32>, DIDDocument> =
            env.storage().get(&DataKey::DIDs).unwrap_or_default();
        dids.get(did)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{symbol_short, testutils::Address as _, BytesN, Env};

    #[test]
    fn test_did_registry_flow() {
        let env = Env::default();
        let owner = Address::random(&env);
        let did = BytesN::random(&env);
        let mut attrs = Map::new(&env);
        attrs.set(
            symbol_short!(&env, "name"),
            Bytes::from_slice(&env, b"Alice"),
        );
        env.set_invoker(owner.clone());
        DIDRegistryContract::register(env.clone(), did.clone(), attrs.clone());
        let doc = DIDRegistryContract::resolve(env.clone(), did.clone()).unwrap();
        assert_eq!(doc.owner, owner);
        // Key rotation
        let new_owner = Address::random(&env);
        env.set_invoker(owner.clone());
        DIDRegistryContract::rotate_key(env.clone(), did.clone(), new_owner.clone());
        let doc = DIDRegistryContract::resolve(env.clone(), did.clone()).unwrap();
        assert_eq!(doc.owner, new_owner);
        // Revoke
        env.set_invoker(new_owner.clone());
        DIDRegistryContract::revoke(env.clone(), did.clone());
        let doc = DIDRegistryContract::resolve(env.clone(), did.clone()).unwrap();
        assert!(doc.revoked);
    }
}
