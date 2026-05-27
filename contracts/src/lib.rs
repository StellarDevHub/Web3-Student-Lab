//! Certificate contract with 2-of-3 governance multisig, RBAC, pause, and WASM upgrade
//! through governance proposals (`PendingAdminAction::Upgrade`).
//!
//! **Upgrade risks:** Malicious WASM can replace authorization logic or corrupt storage
//! expectations; compromised governance keys imply full contract takeover. Audit bytecode,
//! test migrations, and prefer timelocks where applicable.

#![no_std]
#![allow(clippy::all)]
#![allow(warnings)]
#![allow(clippy::all)]
#![allow(warnings)]

pub mod activity_log;
pub mod admin;
pub mod crowdfunding;
pub mod dao_treasury;
pub mod dex_aggregator;
pub mod distribution_manager;
pub mod dynamic_staking;
pub mod enrollment;
pub mod events;
pub mod execution_engine;
pub mod gaming_asset_exchange;
pub mod membership_nft;
pub mod oracle_aggregator;
pub mod paymaster;
pub mod payment_gateway;
pub mod payment_scheduler;
pub mod quadratic_voting;
pub mod rarity_validator;
pub mod rbac;
pub mod reputation_system;
pub mod revocation;
pub mod route_optimizer;
pub mod royalty_splitter;
pub mod sai_wrapper;
pub mod scoring_algorithm;
pub mod session;
pub mod smart_wallet;
pub mod staking;
pub mod statistics;
pub mod sybil_resistance;
pub mod token_buyback;
pub mod token_gated_access;
pub mod verification;
// Fuzz module uses `std` and legacy Soroban test patterns; keep out of the default test build
// until it is refreshed for the current SDK (`sequence_number`, token `mint` arity, etc.).
// #[cfg(test)]
// pub mod fuzz;
pub mod airdrop_manager;
pub mod merkle_distributor;
pub mod milestone_release;
pub mod token;
pub mod upgrade;

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env};

const BASIS_POINTS: u32 = 10_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuctionKind {
    English,
    Dutch,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuctionStatus {
    Open,
    Settled,
    Cancelled,
}

use crate::activity_log::{ActivityLogManager, EventType as LogEventType};
use crate::admin::{AdminPolicy, AdminRole, Permission};
use crate::events::EventRecorder;
use crate::revocation::{CertificateState, CertificateStatus, RevocationReason, RevocationRecord};
use crate::statistics::StatisticsManager;
use crate::token::RsTokenContractClient;
use crate::upgrade::{ContractVersion, PendingUpgrade};
use crate::verification::{CertificateMetadata, VerificationResult};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, String, Symbol, Vec,
};

/// Issued certificate record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Auction {
    pub id: u64,
    pub seller: Address,
    pub nft_contract: Address,
    pub token_id: BytesN<32>,
    pub royalty_receiver: Address,
    pub royalty_bps: u32,
    pub kind: AuctionKind,
    pub status: AuctionStatus,
    pub reserve_price: i128,
    pub buyout_price: i128,
    pub start_price: i128,
    pub end_price: i128,
    pub starts_at: u64,
    pub ends_at: u64,
    pub highest_bidder: Option<Address>,
    pub highest_bid: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    NextAuctionId,
    Auction(u64),
    Escrowed(u64),
    Pending(Address),
}

#[contract]
pub struct MarketplaceEscrowContract;

#[contractimpl]
impl MarketplaceEscrowContract {
    /// Create an English auction and mark the NFT as escrowed by this contract.
    ///
    /// The NFT transfer itself is expected to be authorized by the marketplace
    /// adapter that calls this contract; this contract records the escrow state
    /// and all sale accounting.
    #[allow(clippy::too_many_arguments)]
    pub fn create_english(
        env: Env,
        seller: Address,
        nft_contract: Address,
        token_id: BytesN<32>,
        reserve_price: i128,
        buyout_price: i128,
        duration: u64,
        royalty_receiver: Address,
        royalty_bps: u32,
    ) -> u64 {
        seller.require_auth();
        validate_price(reserve_price);
        validate_price(buyout_price);
        validate_royalty(royalty_bps);
        if buyout_price > 0 && buyout_price < reserve_price {
            panic!("buyout below reserve");
        }

        let now = env.ledger().timestamp();
        let id = next_id(&env);
        let auction = Auction {
            id,
            seller,
            nft_contract,
            token_id,
            royalty_receiver,
            royalty_bps,
            kind: AuctionKind::English,
            status: AuctionStatus::Open,
            reserve_price,
            buyout_price,
            start_price: reserve_price,
            end_price: reserve_price,
            starts_at: now,
            ends_at: checked_add_u64(now, duration),
            highest_bidder: None,
            highest_bid: 0,
        };
        save_auction(&env, &auction);
        env.storage()
            .persistent()
            .set(&DataKey::Escrowed(id), &true);
        id
    }

    /// Create a Dutch auction whose executable price decreases linearly.
    #[allow(clippy::too_many_arguments)]
    pub fn create_dutch(
        env: Env,
        seller: Address,
        nft_contract: Address,
        token_id: BytesN<32>,
        start_price: i128,
        end_price: i128,
        duration: u64,
        royalty_receiver: Address,
        royalty_bps: u32,
    ) -> u64 {
        seller.require_auth();
        validate_price(start_price);
        validate_price(end_price);
        validate_royalty(royalty_bps);
        if end_price > start_price {
            panic!("dutch price must decline");
        }

        let now = env.ledger().timestamp();
        let id = next_id(&env);
        let auction = Auction {
            id,
            seller,
            nft_contract,
            token_id,
            royalty_receiver,
            royalty_bps,
            kind: AuctionKind::Dutch,
            status: AuctionStatus::Open,
            reserve_price: end_price,
            buyout_price: start_price,
            start_price,
            end_price,
            starts_at: now,
            ends_at: checked_add_u64(now, duration),
            highest_bidder: None,
            highest_bid: 0,
        };
        save_auction(&env, &auction);
        env.storage()
            .persistent()
            .set(&DataKey::Escrowed(id), &true);
        id
    }

    /// Place a bid. Outbid participants are credited for pull-based refunds.
    pub fn bid(env: Env, auction_id: u64, bidder: Address, amount: i128) {
        bidder.require_auth();
        validate_price(amount);

        let mut auction = read_open_auction(&env, auction_id);
        let now = env.ledger().timestamp();
        if now < auction.starts_at || now > auction.ends_at {
            panic!("auction not active");
        }

        match auction.kind {
            AuctionKind::English => {
                if amount < auction.reserve_price || amount <= auction.highest_bid {
                    panic!("bid too low");
                }
                if let Some(previous_bidder) = auction.highest_bidder.clone() {
                    credit(&env, previous_bidder, auction.highest_bid);
                }
                auction.highest_bidder = Some(bidder);
                auction.highest_bid = amount;
                if auction.buyout_price > 0 && amount >= auction.buyout_price {
                    settle_open_auction(&env, &mut auction, amount);
                } else {
                    save_auction(&env, &auction);
                }
            }
            AuctionKind::Dutch => {
                let price = dutch_price(&auction, now);
                if amount < price {
                    panic!("bid below current price");
                }
                let refund = checked_sub_i128(amount, price);
                if refund > 0 {
                    credit(&env, bidder.clone(), refund);
                }
                auction.highest_bidder = Some(bidder);
                auction.highest_bid = price;
                settle_open_auction(&env, &mut auction, price);
            }
        }
    }

    /// Settle a completed English auction after its end time.
    pub fn settle(env: Env, auction_id: u64) {
        let mut auction = read_open_auction(&env, auction_id);
        if auction.kind != AuctionKind::English {
            panic!("dutch auction settles on bid");
        }
        if env.ledger().timestamp() <= auction.ends_at {
            panic!("auction still active");
        }
        if auction.highest_bidder.is_none() {
            auction.status = AuctionStatus::Cancelled;
            env.storage()
                .persistent()
                .set(&DataKey::Escrowed(auction.id), &false);
            save_auction(&env, &auction);
            return;
        }
        let sale_price = auction.highest_bid;
        settle_open_auction(&env, &mut auction, sale_price);
    }

    /// Withdraw pending refunds, sale proceeds, or royalty proceeds.
    ///
    /// The returned amount is the transfer amount an outer token adapter should
    /// release to the caller. State is cleared before returning to preserve the
    /// checks-effects-interactions order when adapters perform real transfers.
    pub fn withdraw(env: Env, account: Address) -> i128 {
        account.require_auth();
        let key = DataKey::Pending(account);
        let amount = env.storage().persistent().get(&key).unwrap_or(0_i128);
        env.storage().persistent().set(&key, &0_i128);
        amount
    }

    /// Return the current executable Dutch price.
    pub fn current_price(env: Env, auction_id: u64) -> i128 {
        let auction = read_auction(&env, auction_id);
        match auction.kind {
            AuctionKind::English => auction.highest_bid,
            AuctionKind::Dutch => dutch_price(&auction, env.ledger().timestamp()),
        }
    }

    pub fn get_auction(env: Env, auction_id: u64) -> Auction {
        read_auction(&env, auction_id)
    }

    pub fn pending(env: Env, account: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Pending(account))
            .unwrap_or(0_i128)
    }
}

fn next_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&DataKey::NextAuctionId)
        .unwrap_or(1_u64);
    env.storage()
        .instance()
        .set(&DataKey::NextAuctionId, &checked_add_u64(id, 1));
    id
}

fn validate_price(amount: i128) {
    if amount < 0 {
        panic!("negative amount");
    }
}

fn validate_royalty(royalty_bps: u32) {
    if royalty_bps > BASIS_POINTS {
        panic!("royalty too high");
    }
}

fn checked_add_u64(left: u64, right: u64) -> u64 {
    match left.checked_add(right) {
        Some(value) => value,
        None => panic!("u64 overflow"),
    }
}

fn checked_add_i128(left: i128, right: i128) -> i128 {
    match left.checked_add(right) {
        Some(value) => value,
        None => panic!("i128 overflow"),
    }
}

fn checked_sub_i128(left: i128, right: i128) -> i128 {
    match left.checked_sub(right) {
        Some(value) => value,
        None => panic!("i128 underflow"),
    }
}

fn checked_mul_i128(left: i128, right: i128) -> i128 {
    match left.checked_mul(right) {
        Some(value) => value,
        None => panic!("i128 overflow"),
    }
}

fn read_auction(env: &Env, auction_id: u64) -> Auction {
    env.storage()
        .persistent()
        .get(&DataKey::Auction(auction_id))
        .unwrap_or_else(|| panic!("auction missing"))
}

fn read_open_auction(env: &Env, auction_id: u64) -> Auction {
    let auction = read_auction(env, auction_id);
    if auction.status != AuctionStatus::Open {
        panic!("auction closed");
    }
    auction
}

fn save_auction(env: &Env, auction: &Auction) {
    env.storage()
        .persistent()
        .set(&DataKey::Auction(auction.id), auction);
}

fn credit(env: &Env, account: Address, amount: i128) {
    if amount <= 0 {
        return;
    }
    let key = DataKey::Pending(account);
    let current = env.storage().persistent().get(&key).unwrap_or(0_i128);
    env.storage()
        .persistent()
        .set(&key, &checked_add_i128(current, amount));
}

fn dutch_price(auction: &Auction, now: u64) -> i128 {
    if now <= auction.starts_at {
        return auction.start_price;
    }
    if now >= auction.ends_at || auction.ends_at == auction.starts_at {
        return auction.end_price;
    }

    let elapsed = checked_sub_i128(now as i128, auction.starts_at as i128);
    let duration = checked_sub_i128(auction.ends_at as i128, auction.starts_at as i128);
    let spread = checked_sub_i128(auction.start_price, auction.end_price);
    checked_sub_i128(
        auction.start_price,
        checked_mul_i128(spread, elapsed) / duration,
    )
}

fn settle_open_auction(env: &Env, auction: &mut Auction, sale_price: i128) {
    let royalty = checked_mul_i128(sale_price, auction.royalty_bps as i128) / BASIS_POINTS as i128;
    let seller_proceeds = checked_sub_i128(sale_price, royalty);
    credit(env, auction.royalty_receiver.clone(), royalty);
    credit(env, auction.seller.clone(), seller_proceeds);
    auction.status = AuctionStatus::Settled;
    env.storage()
        .persistent()
        .set(&DataKey::Escrowed(auction.id), &false);
    save_auction(env, auction);
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn token_id(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    #[test]
    fn english_auction_refunds_outbidder_and_distributes_royalties() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let client = MarketplaceEscrowContractClient::new(
            &env,
            &env.register_contract(None, MarketplaceEscrowContract),
        );
        let seller = Address::generate(&env);
        let bidder_one = Address::generate(&env);
        let bidder_two = Address::generate(&env);
        let nft = Address::generate(&env);
        let royalty = Address::generate(&env);

        let auction_id = client.create_english(
            &seller,
            &nft,
            &token_id(&env, 7),
            &100,
            &500,
            &50,
            &royalty,
            &500,
        );

        client.bid(&auction_id, &bidder_one, &125);
        client.bid(&auction_id, &bidder_two, &200);
        assert_eq!(client.pending(&bidder_one), 125);

        env.ledger().with_mut(|ledger| ledger.timestamp = 151);
        client.settle(&auction_id);

        assert_eq!(client.pending(&seller), 190);
        assert_eq!(client.pending(&royalty), 10);
        assert_eq!(client.withdraw(&bidder_one), 125);
        assert_eq!(client.withdraw(&bidder_one), 0);

        let auction = client.get_auction(&auction_id);
        assert_eq!(auction.status, AuctionStatus::Settled);
        assert_eq!(auction.highest_bidder, Some(bidder_two));
    }

    #[test]
    fn english_buyout_settles_immediately() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let client = MarketplaceEscrowContractClient::new(
            &env,
            &env.register_contract(None, MarketplaceEscrowContract),
        );
        let seller = Address::generate(&env);
        let bidder = Address::generate(&env);
        let nft = Address::generate(&env);
        let royalty = Address::generate(&env);

        let auction_id = client.create_english(
            &seller,
            &nft,
            &token_id(&env, 1),
            &100,
            &150,
            &50,
            &royalty,
            &1_000,
        );

        client.bid(&auction_id, &bidder, &150);

        let auction = client.get_auction(&auction_id);
        assert_eq!(auction.status, AuctionStatus::Settled);
        assert_eq!(client.pending(&seller), 135);
        assert_eq!(client.pending(&royalty), 15);
    }

    #[test]
    fn dutch_auction_prices_down_and_refunds_overpayment() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|ledger| ledger.timestamp = 10);
        let client = MarketplaceEscrowContractClient::new(
            &env,
            &env.register_contract(None, MarketplaceEscrowContract),
        );
        let seller = Address::generate(&env);
        let bidder = Address::generate(&env);
        let nft = Address::generate(&env);
        let royalty = Address::generate(&env);

        let auction_id = client.create_dutch(
            &seller,
            &nft,
            &token_id(&env, 9),
            &1_000,
            &100,
            &90,
            &royalty,
            &250,
        );

        env.ledger().with_mut(|ledger| ledger.timestamp = 55);
        assert_eq!(client.current_price(&auction_id), 550);
        client.bid(&auction_id, &bidder, &600);

        assert_eq!(client.pending(&bidder), 50);
        assert_eq!(client.pending(&seller), 537);
        assert_eq!(client.pending(&royalty), 13);
        assert_eq!(
            client.get_auction(&auction_id).status,
            AuctionStatus::Settled
        );
    }

    #[test]
    #[should_panic(expected = "bid too low")]
    fn rejects_low_english_bid() {
        let env = Env::default();
        env.mock_all_auths();
        let client = MarketplaceEscrowContractClient::new(
            &env,
            &env.register_contract(None, MarketplaceEscrowContract),
        );
        let seller = Address::generate(&env);
        let bidder = Address::generate(&env);
        let nft = Address::generate(&env);
        let royalty = Address::generate(&env);

        let auction_id = client.create_english(
            &seller,
            &nft,
            &token_id(&env, 2),
            &100,
            &0,
            &10,
            &royalty,
            &0,
        );
        client.bid(&auction_id, &bidder, &99);
    }
    env.crypto().sha256(&buffer).into()
}
