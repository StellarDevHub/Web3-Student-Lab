use soroban_sdk::{xdr::ToXdr, Bytes, BytesN, Env, Vec};

pub fn verify(env: &Env, proof: Vec<BytesN<32>>, root: &BytesN<32>, leaf: &BytesN<32>) -> bool {
    let mut computed_hash = leaf.clone();

    for proof_element in proof.iter() {
        let mut buffer = Bytes::new(env);
        if computed_hash < proof_element {
            buffer.append(&Bytes::from_array(env, &computed_hash.to_array()));
            buffer.append(&Bytes::from_array(env, &proof_element.to_array()));
        } else {
            buffer.append(&Bytes::from_array(env, &proof_element.to_array()));
            buffer.append(&Bytes::from_array(env, &computed_hash.to_array()));
        }
        computed_hash = env.crypto().sha256(&buffer).into();
    }

    computed_hash == *root
}

pub fn compute_leaf(env: &Env, address: &soroban_sdk::Address, amount: i128) -> BytesN<32> {
    let mut buffer = Bytes::new(env);
    buffer.append(&address.to_xdr(env));
    buffer.append(&amount.to_xdr(env));
    env.crypto().sha256(&buffer).into()
}
