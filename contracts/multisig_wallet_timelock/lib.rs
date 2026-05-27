// Multi-Signature Wallet with Timelock Logic
// Language: Rust (Soroban)

#![no_std]
use soroban_sdk::{contractimpl, contracttype, Address, BytesN, Env, IntoVal, Map, Symbol, Vec};

const MAX_SIGNERS: usize = 10;

#[derive(Clone)]
#[contracttype]
pub struct Proposal {
    pub proposer: Address,
    pub to: Address,
    pub value: i128,
    pub data: Vec<u8>,
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

pub struct MultiSigWalletContract;

#[contractimpl]
impl MultiSigWalletContract {
    pub fn initialize(env: Env, signers: Vec<Address>, threshold: u32, timelock_period: u64) {
        assert!(signers.len() <= MAX_SIGNERS as u32, "Too many signers");
        assert!(
            threshold > 0 && threshold <= signers.len(),
            "Invalid threshold"
        );
        env.storage().set(&DataKey::Signers, &signers);
        env.storage().set(&DataKey::Threshold, &threshold);
        env.storage().set(&DataKey::ProposalCount, &0u32);
        env.storage()
            .set(&DataKey::TimelockPeriod, &timelock_period);
    }

    pub fn submit_proposal(env: Env, to: Address, value: i128, data: Vec<u8>) -> u32 {
        let proposer = env.invoker();
        let mut proposals: Map<u32, Proposal> =
            env.storage().get(&DataKey::Proposals).unwrap_or_default();
        let proposal_count: u32 = env.storage().get(&DataKey::ProposalCount).unwrap_or(0);
        let timelock_period: u64 = env.storage().get(&DataKey::TimelockPeriod).unwrap_or(0);
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
        env.storage().set(&DataKey::Proposals, &proposals);
        env.storage()
            .set(&DataKey::ProposalCount, &(proposal_count + 1));
        proposal_count
    }

    pub fn approve_proposal(env: Env, proposal_id: u32) {
        let signer = env.invoker();
        let mut proposals: Map<u32, Proposal> = env.storage().get(&DataKey::Proposals).unwrap();
        let mut proposal = proposals.get(proposal_id).unwrap();
        let signers: Vec<Address> = env.storage().get(&DataKey::Signers).unwrap();
        assert!(signers.contains(&signer), "Not a signer");
        assert!(!proposal.executed, "Already executed");
        assert!(!proposal.approvals.contains(&signer), "Already approved");
        proposal.approvals.push_back(signer);
        proposals.set(proposal_id, proposal);
        env.storage().set(&DataKey::Proposals, &proposals);
    }

    pub fn execute_proposal(env: Env, proposal_id: u32) {
        let mut proposals: Map<u32, Proposal> = env.storage().get(&DataKey::Proposals).unwrap();
        let mut proposal = proposals.get(proposal_id).unwrap();
        let threshold: u32 = env.storage().get(&DataKey::Threshold).unwrap();
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
        env.storage().set(&DataKey::Proposals, &proposals);
    }

    pub fn add_signer(env: Env, new_signer: Address) {
        let mut signers: Vec<Address> = env.storage().get(&DataKey::Signers).unwrap();
        assert!(!signers.contains(&new_signer), "Already a signer");
        assert!(signers.len() < MAX_SIGNERS as u32, "Max signers reached");
        signers.push_back(new_signer);
        env.storage().set(&DataKey::Signers, &signers);
    }

    pub fn remove_signer(env: Env, signer: Address) {
        let mut signers: Vec<Address> = env.storage().get(&DataKey::Signers).unwrap();
        let idx = signers
            .iter()
            .position(|s| s == &signer)
            .expect("Signer not found");
        signers.remove(idx as u32);
        env.storage().set(&DataKey::Signers, &signers);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_multisig_flow() {
        let env = Env::default();
        let signer1 = Address::random(&env);
        let signer2 = Address::random(&env);
        let signers = Vec::from_array(&env, [signer1.clone(), signer2.clone()]);
        MultiSigWalletContract::initialize(env.clone(), signers, 2, 10);
        let to = Address::random(&env);
        let proposal_id =
            MultiSigWalletContract::submit_proposal(env.clone(), to, 100, Vec::new(&env));
        MultiSigWalletContract::approve_proposal(env.clone(), proposal_id);
        env.set_invoker(signer2.clone());
        MultiSigWalletContract::approve_proposal(env.clone(), proposal_id);
        env.ledger().set_timestamp(20);
        MultiSigWalletContract::execute_proposal(env.clone(), proposal_id);
        let proposals: Map<u32, Proposal> = env.storage().get(&DataKey::Proposals).unwrap();
        let proposal = proposals.get(proposal_id).unwrap();
        assert!(proposal.executed);
    }
}
