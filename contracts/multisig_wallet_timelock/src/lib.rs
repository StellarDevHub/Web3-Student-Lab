// Multi-Signature Wallet with Timelock Logic
// Language: Rust (Soroban)

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, Env, Map, Vec};

const MAX_SIGNERS: usize = 10;

#[derive(Clone)]
#[contracttype]
pub struct Proposal {
    pub proposer: Address,
    pub to: Address,
    pub value: i128,
    pub data: Bytes,
    pub approvals: Vec<Address>,
    pub executed: bool,
    pub created_at: u64,
    pub timelock: u64,
}

#[contracttype]
pub enum DataKey {
    Signers,
    Threshold,
    Proposals,
    ProposalCount,
    TimelockPeriod,
}

#[contract]
pub struct MultiSigWalletContract;

#[contractimpl]
impl MultiSigWalletContract {
    pub fn initialize(env: Env, signers: Vec<Address>, threshold: u32, timelock_period: u64) {
        assert!(signers.len() <= MAX_SIGNERS as u32, "Too many signers");
        assert!(
            threshold > 0 && threshold <= signers.len(),
            "Invalid threshold"
        );
        env.storage().instance().set(&DataKey::Signers, &signers);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
        env.storage().instance().set(&DataKey::ProposalCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::TimelockPeriod, &timelock_period);
    }

    pub fn submit_proposal(
        env: Env,
        proposer: Address,
        to: Address,
        value: i128,
        data: Bytes,
    ) -> u32 {
        proposer.require_auth();

        let signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        assert!(signers.contains(&proposer), "Not a signer");

        let mut proposals: Map<u32, Proposal> = env
            .storage()
            .instance()
            .get(&DataKey::Proposals)
            .unwrap_or_else(|| Map::new(&env));
        let proposal_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalCount)
            .unwrap_or(0);
        let timelock_period: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TimelockPeriod)
            .unwrap_or(0);
        let now = env.ledger().timestamp();

        let proposal = Proposal {
            proposer: proposer.clone(),
            to,
            value,
            data,
            approvals: Vec::new(&env),
            executed: false,
            created_at: now,
            timelock: now + timelock_period,
        };
        proposals.set(proposal_count, proposal);
        env.storage()
            .instance()
            .set(&DataKey::Proposals, &proposals);
        env.storage()
            .instance()
            .set(&DataKey::ProposalCount, &(proposal_count + 1));

        proposal_count
    }

    pub fn approve_proposal(env: Env, signer: Address, proposal_id: u32) {
        signer.require_auth();

        let signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        assert!(signers.contains(&signer), "Not a signer");

        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&DataKey::Proposals).unwrap();
        let mut proposal = proposals.get(proposal_id).unwrap();

        assert!(!proposal.executed, "Already executed");
        assert!(!proposal.approvals.contains(&signer), "Already approved");

        proposal.approvals.push_back(signer);
        proposals.set(proposal_id, proposal);
        env.storage()
            .instance()
            .set(&DataKey::Proposals, &proposals);
    }

    pub fn execute_proposal(env: Env, proposal_id: u32) {
        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&DataKey::Proposals).unwrap();
        let mut proposal = proposals.get(proposal_id).unwrap();
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        let now = env.ledger().timestamp();

        assert!(!proposal.executed, "Already executed");
        assert!(
            proposal.approvals.len() as u32 >= threshold,
            "Not enough approvals"
        );
        assert!(now >= proposal.timelock, "Timelock not expired");

        // Execute transaction logic here (e.g., transfer funds)

        proposal.executed = true;
        proposals.set(proposal_id, proposal);
        env.storage()
            .instance()
            .set(&DataKey::Proposals, &proposals);
    }

    pub fn add_signer(env: Env, new_signer: Address) {
        env.current_contract_address().require_auth();

        let mut signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        assert!(!signers.contains(&new_signer), "Already a signer");
        assert!(signers.len() < MAX_SIGNERS as u32, "Max signers reached");

        signers.push_back(new_signer);
        env.storage().instance().set(&DataKey::Signers, &signers);
    }

    pub fn remove_signer(env: Env, signer: Address) {
        env.current_contract_address().require_auth();

        let mut signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        let idx = signers
            .iter()
            .position(|s| s == signer)
            .expect("Signer not found");

        signers.remove(idx as u32);
        env.storage().instance().set(&DataKey::Signers, &signers);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, Env};

    #[test]
    fn test_multisig_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(MultiSigWalletContract, ());
        let client = MultiSigWalletContractClient::new(&env, &contract_id);

        let signer1 = Address::generate(&env);
        let signer2 = Address::generate(&env);
        let signers = Vec::from_array(&env, [signer1.clone(), signer2.clone()]);

        client.initialize(&signers, &2, &10);

        let to = Address::generate(&env);
        let data = Bytes::new(&env);
        let proposal_id = client.submit_proposal(&signer1, &to, &100, &data);

        client.approve_proposal(&signer1, &proposal_id);
        client.approve_proposal(&signer2, &proposal_id);

        // Advance ledger timestamp to pass timelock period (timelock period = 10)
        env.ledger().with_mut(|l| l.timestamp = 20);

        client.execute_proposal(&proposal_id);

        let proposals: Map<u32, Proposal> = env.as_contract(&contract_id, || {
            env.storage().instance().get(&DataKey::Proposals).unwrap()
        });
        let proposal = proposals.get(proposal_id).unwrap();
        assert!(proposal.executed);
    }
}
