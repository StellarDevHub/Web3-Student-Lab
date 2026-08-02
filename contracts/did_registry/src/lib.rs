// Decentralized Identity (DID) Registry Contract
// Language: Rust (Soroban)

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, Symbol, Vec,
};

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
        assert!(!dids.contains_key(did.clone()), "DID already registered");
        let doc = DIDDocument {
            owner: owner.clone(),
            attributes,
            controllers: Vec::new(&env),
            revoked: false,
        };
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn update(env: Env, sender: Address, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(
            doc.owner == sender || doc.controllers.contains(&sender),
            "Not authorized"
        );
        doc.attributes = attributes;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn rotate_key(env: Env, sender: Address, did: BytesN<32>, new_owner: Address) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(doc.owner == sender, "Only owner can rotate key");
        doc.owner = new_owner;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn revoke(env: Env, sender: Address, did: BytesN<32>) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can revoke");
        doc.revoked = true;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn add_controller(env: Env, sender: Address, did: BytesN<32>, controller: Address) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can add controller");
        if !doc.controllers.contains(&controller) {
            doc.controllers.push_back(controller);
        }
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn remove_controller(env: Env, sender: Address, did: BytesN<32>, controller: Address) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can remove controller");
        let idx = doc.controllers.iter().position(|c| c == controller);
        if let Some(i) = idx {
            doc.controllers.remove(i as u32);
        }
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn resolve(env: Env, did: BytesN<32>) -> Option<DIDDocument> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
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
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let did = BytesN::from_array(&env, &[1u8; 32]);
        let mut attrs = Map::new(&env);
        attrs.set(symbol_short!("name"), Bytes::from_slice(&env, b"Alice"));

        DIDRegistryContract::register(env.clone(), owner.clone(), did.clone(), attrs.clone());
        let doc = DIDRegistryContract::resolve(env.clone(), did.clone()).unwrap();
        assert_eq!(doc.owner, owner);

        // Key rotation
        let new_owner = Address::generate(&env);
        DIDRegistryContract::rotate_key(env.clone(), owner.clone(), did.clone(), new_owner.clone());
        let doc = DIDRegistryContract::resolve(env.clone(), did.clone()).unwrap();
        assert_eq!(doc.owner, new_owner);

        // Revoke
        DIDRegistryContract::revoke(env.clone(), new_owner.clone(), did.clone());
        let doc = DIDRegistryContract::resolve(env.clone(), did.clone()).unwrap();
        assert!(doc.revoked);
    }
}
