#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Phase,
    Root(u32),
    ClaimedWord(u32, u32),
    Pending(Address),
}

#[contract]
pub struct MerkleAirdropContract;

#[contractimpl]
impl MerkleAirdropContract {
    /// Initialize the distributor with an admin and the first Merkle root.
    pub fn initialize(env: Env, admin: Address, root: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Phase, &1_u32);
        env.storage().persistent().set(&DataKey::Root(1), &root);
    }

    /// Start a new airdrop phase with a replacement Merkle root.
    ///
    /// Claim bitmaps are keyed by phase, so previous claims cannot block later
    /// campaign phases while still preventing duplicate claims within a phase.
    pub fn set_root(env: Env, admin: Address, root: BytesN<32>) -> u32 {
        require_admin(&env, &admin);
        let next_phase = checked_add_u32(current_phase(&env), 1);
        env.storage().instance().set(&DataKey::Phase, &next_phase);
        env.storage()
            .persistent()
            .set(&DataKey::Root(next_phase), &root);
        next_phase
    }

    /// Claim an allocation proven by the current phase Merkle root.
    ///
    /// The verified amount is credited to the caller's pending balance. Token
    /// transfer adapters can release that balance after this state change.
    pub fn claim(
        env: Env,
        index: u32,
        account: Address,
        amount: i128,
        proof: Vec<BytesN<32>>,
    ) -> i128 {
        account.require_auth();
        if amount <= 0 {
            panic!("invalid amount");
        }

        let phase = current_phase(&env);
        if is_claimed_internal(&env, phase, index) {
            panic!("already claimed");
        }

        let leaf = leaf_hash(&env, phase, index, account.clone(), amount);
        let root = root_for_phase(&env, phase);
        if !verify_proof(&env, leaf, proof, root) {
            panic!("invalid proof");
        }

        set_claimed(&env, phase, index);
        credit(&env, account, amount);
        amount
    }

    /// Withdraw and clear the caller's verified claim balance.
    pub fn withdraw(env: Env, account: Address) -> i128 {
        account.require_auth();
        let key = DataKey::Pending(account);
        let amount = env.storage().persistent().get(&key).unwrap_or(0_i128);
        env.storage().persistent().set(&key, &0_i128);
        amount
    }

    pub fn is_claimed(env: Env, phase: u32, index: u32) -> bool {
        is_claimed_internal(&env, phase, index)
    }

    pub fn pending(env: Env, account: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Pending(account))
            .unwrap_or(0_i128)
    }

    pub fn current_phase(env: Env) -> u32 {
        current_phase(&env)
    }

    pub fn root(env: Env, phase: u32) -> BytesN<32> {
        root_for_phase(&env, phase)
    }

    pub fn leaf(env: Env, phase: u32, index: u32, account: Address, amount: i128) -> BytesN<32> {
        leaf_hash(&env, phase, index, account, amount)
    }
}

fn require_admin(env: &Env, admin: &Address) {
    let stored: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("not initialized"));
    if stored != *admin {
        panic!("not admin");
    }
    admin.require_auth();
}

fn current_phase(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::Phase)
        .unwrap_or_else(|| panic!("not initialized"))
}

fn root_for_phase(env: &Env, phase: u32) -> BytesN<32> {
    env.storage()
        .persistent()
        .get(&DataKey::Root(phase))
        .unwrap_or_else(|| panic!("root missing"))
}

fn checked_add_u32(left: u32, right: u32) -> u32 {
    match left.checked_add(right) {
        Some(value) => value,
        None => panic!("u32 overflow"),
    }
}

fn checked_add_i128(left: i128, right: i128) -> i128 {
    match left.checked_add(right) {
        Some(value) => value,
        None => panic!("i128 overflow"),
    }
}

fn leaf_hash(env: &Env, phase: u32, index: u32, account: Address, amount: i128) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(&phase.to_xdr(env));
    data.append(&index.to_xdr(env));
    data.append(&account.to_xdr(env));
    data.append(&amount.to_xdr(env));
    env.crypto().sha256(&data)
}

fn verify_proof(env: &Env, leaf: BytesN<32>, proof: Vec<BytesN<32>>, root: BytesN<32>) -> bool {
    let mut computed = leaf;
    for sibling in proof.iter() {
        computed = hash_pair(env, computed, sibling);
    }
    computed == root
}

fn hash_pair(env: &Env, left: BytesN<32>, right: BytesN<32>) -> BytesN<32> {
    let mut data = Bytes::new(env);
    if bytes_le(&left, &right) {
        data.append(&Bytes::from_array(env, &left.to_array()));
        data.append(&Bytes::from_array(env, &right.to_array()));
    } else {
        data.append(&Bytes::from_array(env, &right.to_array()));
        data.append(&Bytes::from_array(env, &left.to_array()));
    }
    env.crypto().sha256(&data)
}

fn bytes_le(left: &BytesN<32>, right: &BytesN<32>) -> bool {
    let left_bytes = left.to_array();
    let right_bytes = right.to_array();
    let mut i = 0;
    while i < 32 {
        if left_bytes[i] < right_bytes[i] {
            return true;
        }
        if left_bytes[i] > right_bytes[i] {
            return false;
        }
        i += 1;
    }
    true
}

fn is_claimed_internal(env: &Env, phase: u32, index: u32) -> bool {
    let word_index = index / 64;
    let bit_index = index % 64;
    let word = env
        .storage()
        .persistent()
        .get(&DataKey::ClaimedWord(phase, word_index))
        .unwrap_or(0_u64);
    (word & (1_u64 << bit_index)) != 0
}

fn set_claimed(env: &Env, phase: u32, index: u32) {
    let word_index = index / 64;
    let bit_index = index % 64;
    let key = DataKey::ClaimedWord(phase, word_index);
    let word = env.storage().persistent().get(&key).unwrap_or(0_u64);
    env.storage()
        .persistent()
        .set(&key, &(word | (1_u64 << bit_index)));
}

fn credit(env: &Env, account: Address, amount: i128) {
    let key = DataKey::Pending(account);
    let current = env.storage().persistent().get(&key).unwrap_or(0_i128);
    env.storage()
        .persistent()
        .set(&key, &checked_add_i128(current, amount));
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn pair(env: &Env, left: BytesN<32>, right: BytesN<32>) -> BytesN<32> {
        hash_pair(env, left, right)
    }

    #[test]
    fn claims_valid_merkle_proof_once_and_uses_bitmap() {
        let env = Env::default();
        env.mock_all_auths();
        let client = MerkleAirdropContractClient::new(
            &env,
            &env.register_contract(None, MerkleAirdropContract),
        );
        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let alice_leaf = MerkleAirdropContract::leaf(env.clone(), 1, 3, alice.clone(), 500);
        let bob_leaf = MerkleAirdropContract::leaf(env.clone(), 1, 4, bob, 700);
        let root = pair(&env, alice_leaf.clone(), bob_leaf.clone());

        client.initialize(&admin, &root);
        let mut proof = Vec::new(&env);
        proof.push_back(bob_leaf);

        assert_eq!(client.claim(&3, &alice, &500, &proof), 500);
        assert!(client.is_claimed(&1, &3));
        assert_eq!(client.pending(&alice), 500);
        assert_eq!(client.withdraw(&alice), 500);
        assert_eq!(client.withdraw(&alice), 0);
    }

    #[test]
    #[should_panic(expected = "already claimed")]
    fn rejects_double_claim() {
        let env = Env::default();
        env.mock_all_auths();
        let client = MerkleAirdropContractClient::new(
            &env,
            &env.register_contract(None, MerkleAirdropContract),
        );
        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let leaf = MerkleAirdropContract::leaf(env.clone(), 1, 1, alice.clone(), 100);
        client.initialize(&admin, &leaf);
        let proof = Vec::new(&env);

        client.claim(&1, &alice, &100, &proof);
        client.claim(&1, &alice, &100, &proof);
    }

    #[test]
    fn admin_can_rotate_roots_for_new_phases() {
        let env = Env::default();
        env.mock_all_auths();
        let client = MerkleAirdropContractClient::new(
            &env,
            &env.register_contract(None, MerkleAirdropContract),
        );
        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let root_one = MerkleAirdropContract::leaf(env.clone(), 1, 1, alice.clone(), 100);
        let root_two = MerkleAirdropContract::leaf(env.clone(), 2, 1, alice.clone(), 200);
        client.initialize(&admin, &root_one);

        assert_eq!(client.set_root(&admin, &root_two), 2);
        assert_eq!(client.current_phase(), 2);
        assert_eq!(client.root(&2), root_two);
    }

    #[test]
    #[should_panic(expected = "invalid proof")]
    fn rejects_invalid_proof() {
        let env = Env::default();
        env.mock_all_auths();
        let client = MerkleAirdropContractClient::new(
            &env,
            &env.register_contract(None, MerkleAirdropContract),
        );
        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let root = BytesN::from_array(&env, &[1; 32]);
        client.initialize(&admin, &root);
        let proof = Vec::new(&env);

        client.claim(&1, &alice, &100, &proof);
    }
}
