// Multi-Signature Wallet with Timelock Logic
// Language: Rust (Soroban)

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol, Val, Vec,
};
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    Reentrancy = 1,
    AlreadyInitialized = 2,
}

const MAX_SIGNERS: usize = 10;
const LOCK: Symbol = symbol_short!("mw_lock");

#[derive(Clone)]
#[contracttype]
pub struct Proposal {
    pub proposer: Address,
    pub to: Address,
    pub value: i128,
    pub function: Symbol,
    pub args: Vec<Val>,
    pub approvals: Vec<Address>,
    pub executed: bool,
    pub created_at: u64,
    pub timelock: u64,
}

#[contracttype]
pub enum DataKey {
    Signers,
    Threshold,
    Proposal(u32),
    ProposalCount,
    TimelockPeriod,
}

#[contract]
pub struct MultiSigWalletContract;

#[contractimpl]
impl MultiSigWalletContract {
    pub fn initialize(env: Env, signers: Vec<Address>, threshold: u32, timelock_period: u64) {
        if env.storage().instance().has(&DataKey::Signers) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
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
        function: Symbol,
        args: Vec<Val>,
    ) -> u32 {
        proposer.require_auth();
        Self::lock(&env);

        let signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        assert!(signers.contains(&proposer), "Not a signer");

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
            function,
            args,
            approvals: Vec::new(&env),
            executed: false,
            created_at: now,
            timelock: now + timelock_period,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_count), &proposal);
        env.storage()
            .instance()
            .set(&DataKey::ProposalCount, &(proposal_count + 1));

        Self::unlock(&env);
        proposal_count
    }

    pub fn approve_proposal(env: Env, signer: Address, proposal_id: u32) {
        signer.require_auth();
        Self::lock(&env);

        let signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        assert!(signers.contains(&signer), "Not a signer");

        let proposal_key = DataKey::Proposal(proposal_id);
        let mut proposal: Proposal = env.storage().persistent().get(&proposal_key).unwrap();

        assert!(!proposal.executed, "Already executed");
        assert!(!proposal.approvals.contains(&signer), "Already approved");

        proposal.approvals.push_back(signer);
        env.storage().persistent().set(&proposal_key, &proposal);
        Self::unlock(&env);
    }

    pub fn execute_proposal(env: Env, proposal_id: u32) {
        Self::lock(&env);
        let proposal_key = DataKey::Proposal(proposal_id);
        let mut proposal: Proposal = env.storage().persistent().get(&proposal_key).unwrap();
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        let now = env.ledger().timestamp();

        assert!(!proposal.executed, "Already executed");
        assert!(
            proposal.approvals.len() as u32 >= threshold,
            "Not enough approvals"
        );
        assert!(now >= proposal.timelock, "Timelock not expired");

        proposal.executed = true;
        env.storage().persistent().set(&proposal_key, &proposal);
        let _: Val = env.invoke_contract(&proposal.to, &proposal.function, proposal.args);
        Self::unlock(&env);
    }

    pub fn add_signer(env: Env, new_signer: Address) {
        Self::lock(&env);
        env.current_contract_address().require_auth();

        let mut signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        assert!(!signers.contains(&new_signer), "Already a signer");
        assert!(signers.len() < MAX_SIGNERS as u32, "Max signers reached");

        signers.push_back(new_signer);
        env.storage().instance().set(&DataKey::Signers, &signers);
        Self::unlock(&env);
    }

    pub fn remove_signer(env: Env, signer: Address) {
        Self::lock(&env);
        env.current_contract_address().require_auth();

        let mut signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        let idx = signers
            .iter()
            .position(|s| s == signer)
            .expect("Signer not found");

        signers.remove(idx as u32);
        env.storage().instance().set(&DataKey::Signers, &signers);
        Self::unlock(&env);
    }

    // â”€â”€ Reentrancy guards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    fn lock(env: &Env) {
        let locked: bool = env.storage().temporary().get(&LOCK).unwrap_or(false);
        if locked {
            panic_with_error!(&env, Error::Reentrancy);
        }
        env.storage().temporary().set(&LOCK, &true);
    }

    fn unlock(env: &Env) {
        env.storage().temporary().remove(&LOCK);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl, testutils::Address as _, testutils::Ledger, Env, IntoVal,
    };

    #[contract]
    pub struct ExecutionTarget;

    #[contractimpl]
    impl ExecutionTarget {
        pub fn record(_env: Env, value: i128) -> i128 {
            value
        }
    }

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

        let to = env.register(ExecutionTarget, ());
        let args = Vec::from_array(&env, [100i128.into_val(&env)]);
        let proposal_id =
            client.submit_proposal(&signer1, &to, &100, &symbol_short!("record"), &args);

        client.approve_proposal(&signer1, &proposal_id);
        client.approve_proposal(&signer2, &proposal_id);

        // Advance ledger timestamp to pass timelock period (timelock period = 10)
        env.ledger().with_mut(|l| l.timestamp = 20);

        client.execute_proposal(&proposal_id);

        let proposal: Proposal = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::Proposal(proposal_id))
                .unwrap()
        });
        assert!(proposal.executed);
    }
}
