#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
    Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    NftContract,
    TokenId,
    TotalShares,
    Share(Address),
    Proposal,
    Vote(Address),
    Treasury,
    Finalized,
    PayoutClaimed(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuyoutProposal {
    pub proposer: Address,
    pub offer_amount: i128,
    pub voting_deadline: u64,
    pub yes_votes: i128,
    pub no_votes: i128,
}

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum VaultError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    ProposalMissing = 5,
    ProposalActive = 6,
    AlreadyVoted = 7,
    BuyoutNotApproved = 8,
    AlreadyFinalized = 9,
    AlreadyClaimed = 10,
    NoShares = 11,
}

#[contract]
pub struct FractionalNftVaultContract;

#[contractimpl]
impl FractionalNftVaultContract {
    pub fn initialize(env: Env, admin: Address, nft_contract: Address, token_id: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VaultError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NftContract, &nft_contract);
        env.storage().instance().set(&DataKey::TokenId, &token_id);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage().instance().set(&DataKey::Treasury, &0i128);
        env.storage().instance().set(&DataKey::Finalized, &false);
    }

    pub fn fractionalize(env: Env, owner: Address, total_shares: i128) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        owner.require_auth();

        if total_shares <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        let admin = read_admin(&env);
        if owner != admin {
            panic_with_error!(&env, VaultError::Unauthorized);
        }

        env.storage().instance().set(&DataKey::TotalShares, &total_shares);
        env.storage()
            .instance()
            .set(&DataKey::Share(owner), &total_shares);
    }

    pub fn transfer_shares(env: Env, from: Address, to: Address, shares: i128) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        from.require_auth();

        if shares <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        let from_balance = share_balance_internal(&env, &from);
        if from_balance < shares {
            panic_with_error!(&env, VaultError::NoShares);
        }

        let to_balance = share_balance_internal(&env, &to);
        env.storage()
            .instance()
            .set(&DataKey::Share(from), &(from_balance - shares));
        env.storage()
            .instance()
            .set(&DataKey::Share(to), &(to_balance + shares));
    }

    pub fn propose_buyout(env: Env, proposer: Address, offer_amount: i128, voting_deadline: u64) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        proposer.require_auth();

        if offer_amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }
        if voting_deadline <= env.ledger().timestamp() {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        let proposal = BuyoutProposal {
            proposer,
            offer_amount,
            voting_deadline,
            yes_votes: 0,
            no_votes: 0,
        };

        env.storage().instance().set(&DataKey::Proposal, &proposal);
    }

    pub fn vote_buyout(env: Env, voter: Address, support: bool) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        voter.require_auth();

        if env.storage().instance().has(&DataKey::Vote(voter.clone())) {
            panic_with_error!(&env, VaultError::AlreadyVoted);
        }

        let mut proposal: BuyoutProposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal)
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::ProposalMissing));

        if env.ledger().timestamp() > proposal.voting_deadline {
            panic_with_error!(&env, VaultError::ProposalActive);
        }

        let voting_power = share_balance_internal(&env, &voter);
        if voting_power <= 0 {
            panic_with_error!(&env, VaultError::NoShares);
        }

        if support {
            proposal.yes_votes += voting_power;
        } else {
            proposal.no_votes += voting_power;
        }

        env.storage().instance().set(&DataKey::Proposal, &proposal);
        env.storage().instance().set(&DataKey::Vote(voter), &true);
    }

    pub fn finalize_buyout(env: Env, caller: Address) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        caller.require_auth();

        let admin = read_admin(&env);
        if caller != admin {
            panic_with_error!(&env, VaultError::Unauthorized);
        }

        let proposal: BuyoutProposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal)
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::ProposalMissing));

        if env.ledger().timestamp() <= proposal.voting_deadline {
            panic_with_error!(&env, VaultError::ProposalActive);
        }

        let total_shares = read_total_shares(&env);
        if proposal.yes_votes * 2 <= total_shares || proposal.yes_votes <= proposal.no_votes {
            panic_with_error!(&env, VaultError::BuyoutNotApproved);
        }

        env.storage()
            .instance()
            .set(&DataKey::Treasury, &proposal.offer_amount);
        env.storage().instance().set(&DataKey::Finalized, &true);
    }

    pub fn claim_buyout_payout(env: Env, holder: Address) -> i128 {
        ensure_initialized(&env);
        holder.require_auth();

        let finalized: bool = env
            .storage()
            .instance()
            .get(&DataKey::Finalized)
            .unwrap_or(false);
        if !finalized {
            panic_with_error!(&env, VaultError::BuyoutNotApproved);
        }

        if env.storage().instance().has(&DataKey::PayoutClaimed(holder.clone())) {
            panic_with_error!(&env, VaultError::AlreadyClaimed);
        }

        let holder_shares = share_balance_internal(&env, &holder);
        if holder_shares <= 0 {
            panic_with_error!(&env, VaultError::NoShares);
        }

        let total_shares = read_total_shares(&env);
        let treasury: i128 = env.storage().instance().get(&DataKey::Treasury).unwrap_or(0);
        let payout = (treasury * holder_shares) / total_shares;

        env.storage()
            .instance()
            .set(&DataKey::PayoutClaimed(holder), &true);
        payout
    }

    pub fn share_balance(env: Env, owner: Address) -> i128 {
        share_balance_internal(&env, &owner)
    }

    pub fn proposal(env: Env) -> Option<BuyoutProposal> {
        env.storage().instance().get(&DataKey::Proposal)
    }

    pub fn shareholders(env: Env, accounts: Vec<Address>) -> Vec<(Address, i128)> {
        let mut result = Vec::new(&env);
        for account in accounts.iter() {
            result.push_back((account.clone(), share_balance_internal(&env, &account)));
        }
        result
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, VaultError::NotInitialized);
    }
}

fn ensure_not_finalized(env: &Env) {
    let finalized: bool = env
        .storage()
        .instance()
        .get(&DataKey::Finalized)
        .unwrap_or(false);
    if finalized {
        panic_with_error!(env, VaultError::AlreadyFinalized);
    }
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn read_total_shares(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::TotalShares)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn share_balance_internal(env: &Env, owner: &Address) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::Share(owner.clone()))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env};

    fn client(env: &Env) -> FractionalNftVaultContractClient<'_> {
        let id = env.register(FractionalNftVaultContract, ());
        FractionalNftVaultContractClient::new(env, &id)
    }

    #[test]
    fn distributes_buyout_payout_pro_rata() {
        let env = Env::default();
        env.mock_all_auths();
        let client = client(&env);

        let admin = Address::generate(&env);
        let user_a = Address::generate(&env);
        let user_b = Address::generate(&env);
        let nft = Address::generate(&env);
        let token_id = BytesN::from_array(&env, &[7; 32]);

        client.initialize(&admin, &nft, &token_id);
        client.fractionalize(&admin, &1_000);
        client.transfer_shares(&admin, &user_a, &200);
        client.transfer_shares(&admin, &user_b, &300);

        let deadline = env.ledger().timestamp() + 10;
        client.propose_buyout(&admin, &10_000, &deadline);

        client.vote_buyout(&admin, &true);
        client.vote_buyout(&user_a, &true);
        client.vote_buyout(&user_b, &true);

        env.ledger().with_mut(|li| li.timestamp = deadline + 1);
        client.finalize_buyout(&admin);

        let payout_admin = client.claim_buyout_payout(&admin);
        let payout_a = client.claim_buyout_payout(&user_a);
        let payout_b = client.claim_buyout_payout(&user_b);

        assert_eq!(payout_admin, 5_000);
        assert_eq!(payout_a, 2_000);
        assert_eq!(payout_b, 3_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn cannot_vote_twice() {
        let env = Env::default();
        env.mock_all_auths();
        let client = client(&env);

        let admin = Address::generate(&env);
        let nft = Address::generate(&env);

        client.initialize(&admin, &nft, &BytesN::from_array(&env, &[1; 32]));
        client.fractionalize(&admin, &100);
        client.propose_buyout(&admin, &1_000, &(env.ledger().timestamp() + 20));

        client.vote_buyout(&admin, &true);
        client.vote_buyout(&admin, &false);
    }
}
