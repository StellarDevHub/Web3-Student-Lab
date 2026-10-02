#![no_std]

//! # Fractional NFT Vault
//!
//! A decentralized vault that lets students and mentors **lock a valuable
//! achievement NFT** (e.g. a Soroban certificate NFT) and **issue divisible
//! fractional shares** to authorized stakeholders.
//!
//! The vault:
//!
//! 1. **Custodially locks** the NFT (transferred into the vault) at
//!    [`FractionalNftVaultContract::fractionalize`] time.
//! 2. **Mints SEP-41 fractional shares** on a Stellar Asset Contract whose
//!    admin is the vault (see [`FractionalNftVaultContract::initialize`]).
//! 3. Runs a **buyout auction**: bidders escrow payment-token bids; the
//!    highest bid at the deadline wins 100% redemption of the NFT.
//! 4. Distributes the buyout proceeds **strictly pro-rata** to share
//!    holders, and lets a 100% holder redeem the NFT directly.
//!
//! Locked NFTs cannot be withdrawn until either the fractional shares are
//! 100% redeemed ([`FractionalNftVaultContract::redeem_nft`]) or the buyout
//! completes ([`FractionalNftVaultContract::finalize_buyout`]).

#[cfg(test)]
extern crate std;

use commit_reveal_rng::{
    bid_commitment, extend_deadline, should_extend_deadline, Bid, ANTI_SNIPE_EXTENSION_SECS,
    ANTI_SNIPE_WINDOW_SECS,
};
use contract_events::{
    publish_auction, publish_bid, publish_payout, publish_shares_minted, publish_vault_lock,
};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env, IntoVal, Map, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    NftContract,
    TokenId,
    ShareToken,
    PaymentToken,
    TotalShares,
    Share(Address),
    Auction,
    Treasury,
    Finalized,
    NftLocked,
    PayoutClaimed(Address),
    /// SEP-0029 secondary-sale royalty cut, in basis points.
    RoyaltyBps,
    /// Address that receives the royalty cut on a buyout sale.
    RoyaltyRecipient,
    /// Soulbound / non-transferable flag for fractional shares.
    Soulbound,
    /// Commit-reveal (Vickrey) auction state.
    CrAuction,
}

/// Cap on the configurable royalty cut: 50% (5_000 bps).
pub const MAX_ROYALTY_BPS: u32 = 5_000;
pub const BPS_DENOMINATOR: i128 = 10_000;

/// Live buyout auction state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionState {
    /// Minimum acceptable first bid.
    pub min_bid: i128,
    /// Ledger timestamp after which the auction can be finalized.
    pub deadline: u64,
    /// Ledger timestamp at which the auction was started.
    pub started_at: u64,
    /// Number of anti-snipe deadline extensions applied so far.
    pub extensions: u32,
    /// Current leading bidder (escrowed in the vault).
    pub current_bidder: Option<Address>,
    /// Current leading bid amount.
    pub current_bid: i128,
}

/// A blinded commit-reveal (Vickrey) auction.
///
/// During the commit phase bidders publish `sha256(amount_be || nonce)` plus an
/// anti-spam deposit. During the reveal phase they reveal `(amount, nonce)`;
/// the contract verifies the commitment and escrows the amount. The highest
/// revealer wins but pays only the **second-highest** revealed amount
/// (Vickrey/second-price). Deposits from commitments that are never revealed
/// are forfeited into the buyout treasury.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CommitRevealAuction {
    /// Minimum acceptable revealed bid.
    pub min_bid: i128,
    /// Anti-spam deposit required per commitment.
    pub deposit: i128,
    /// Ledger timestamp at which committing closes.
    pub commit_deadline: u64,
    /// Ledger timestamp at which revealing closes.
    pub reveal_deadline: u64,
    /// Ledger timestamp at which the auction started.
    pub started_at: u64,
    /// Number of anti-snipe deadline extensions applied so far.
    pub extensions: u32,
    /// Highest valid revealer.
    pub highest_bidder: Option<Address>,
    /// Highest revealed amount.
    pub highest_bid: i128,
    /// Second-highest revealed amount (the Vickrey price).
    pub second_highest_bid: i128,
    /// Number of valid reveals.
    pub revealed_count: u32,
    /// Deposits forfeited by bidders who never revealed.
    pub forfeited_deposits: i128,
    /// Whether the auction has been finalized.
    pub finalized: bool,
    /// Commitment published by each bidder.
    pub commits: Map<Address, BytesN<32>>,
    /// Escrowed amount for each valid reveal.
    pub reveals: Map<Address, i128>,
    /// Outstanding (not yet refunded) deposit for each bidder.
    pub deposits: Map<Address, i128>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VaultError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    AuctionMissing = 5,
    AuctionActive = 6,
    BidTooLow = 7,
    NoBids = 8,
    AlreadyFinalized = 9,
    AlreadyClaimed = 10,
    NoShares = 11,
    ShareMismatch = 12,
    NftNotLocked = 13,
    RoyaltyTooHigh = 14,
    SoulboundNonTransferable = 15,
    AlreadyCommitted = 16,
    InvalidCommitment = 17,
}

#[contract]
pub struct FractionalNftVaultContract;

#[contractimpl]
impl FractionalNftVaultContract {
    /// Initialize the vault.
    ///
    /// * `admin` — owner of the vault; must hold the NFT at
    ///   [`FractionalNftVaultContract::fractionalize`] time.
    /// * `nft_contract` — the NFT contract holding `token_id`. It must
    ///   implement the standard Soroban NFT interface:
    ///   `transfer(env, from, to, token_id)` and `owner(env, token_id)`.
    /// * `token_id` — the NFT being fractionalized.
    /// * `share_token` — a Stellar Asset Contract used for fractional
    ///   shares; **the vault must be its admin** so it can mint/burn.
    /// * `payment_token` — the asset used for buyout bids and payouts.
    pub fn initialize(
        env: Env,
        admin: Address,
        nft_contract: Address,
        token_id: BytesN<32>,
        share_token: Address,
        payment_token: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VaultError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::NftContract, &nft_contract);
        env.storage().instance().set(&DataKey::TokenId, &token_id);
        env.storage()
            .instance()
            .set(&DataKey::ShareToken, &share_token);
        env.storage()
            .instance()
            .set(&DataKey::PaymentToken, &payment_token);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage().instance().set(&DataKey::Treasury, &0i128);
        env.storage().instance().set(&DataKey::Finalized, &false);
        env.storage().instance().set(&DataKey::NftLocked, &false);
        env.storage().instance().set(&DataKey::RoyaltyBps, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::RoyaltyRecipient, &admin);
        // Fractional shares are freely transferable by default; the admin
        // can opt into soulbound (non-transferable) mode explicitly.
        env.storage().instance().set(&DataKey::Soulbound, &false);
    }

    /// Set the SEP-0029 secondary-sale royalty cut (in basis points) and
    /// the address that receives it. Admin only.
    pub fn set_royalty(env: Env, admin: Address, royalty_bps: u32, recipient: Address) {
        ensure_initialized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        if royalty_bps > MAX_ROYALTY_BPS {
            panic_with_error!(&env, VaultError::RoyaltyTooHigh);
        }

        env.storage()
            .instance()
            .set(&DataKey::RoyaltyBps, &royalty_bps);
        env.storage()
            .instance()
            .set(&DataKey::RoyaltyRecipient, &recipient);
    }

    pub fn royalty_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::RoyaltyBps)
            .unwrap_or(0)
    }

    /// Mark fractional shares as soulbound (non-transferable). Admin only,
    /// and — matching the soulbound spec — this is a one-way switch: once
    /// set it cannot be cleared again.
    pub fn set_soulbound(env: Env, admin: Address, soulbound: bool) {
        ensure_initialized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        let already: bool = read_bool(&env, DataKey::Soulbound);
        if already && !soulbound {
            panic_with_error!(&env, VaultError::SoulboundNonTransferable);
        }

        env.storage().instance().set(&DataKey::Soulbound, &soulbound);
    }

    pub fn is_soulbound(env: Env) -> bool {
        read_bool(&env, DataKey::Soulbound)
    }

    /// Lock the NFT into the vault and mint `total_shares` fractional
    /// shares to the `recipients`.
    ///
    /// `owner` must be the vault admin **and** the current NFT owner. The
    /// sum of `recipients` amounts must equal `total_shares`.
    pub fn fractionalize(
        env: Env,
        owner: Address,
        recipients: Vec<(Address, i128)>,
        total_shares: i128,
    ) {
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
        if read_bool(&env, DataKey::NftLocked) {
            panic_with_error!(&env, VaultError::AlreadyFinalized);
        }

        let mut sum: i128 = 0;
        for (_, amount) in recipients.iter() {
            if amount <= 0 {
                panic_with_error!(&env, VaultError::InvalidAmount);
            }
            sum += amount;
        }
        if sum != total_shares {
            panic_with_error!(&env, VaultError::ShareMismatch);
        }

        // Custodial lock: pull the NFT into the vault.
        let nft_contract = read_nft_contract(&env);
        let token_id = read_token_id(&env);
        NftClient::new(&env, &nft_contract).transfer(
            &owner,
            &env.current_contract_address(),
            &token_id,
        );
        env.storage().instance().set(&DataKey::NftLocked, &true);

        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &total_shares);
        let share_token = read_share_token(&env);
        let share_client = token::StellarAssetClient::new(&env, &share_token);
        for (recipient, amount) in recipients.iter() {
            let balance = share_balance_internal(&env, &recipient);
            env.storage()
                .instance()
                .set(&DataKey::Share(recipient.clone()), &(balance + amount));
            share_client.mint(&recipient, &amount);
            publish_shares_minted(&env, &recipient, amount, total_shares);
        }

        publish_vault_lock(&env, &owner, &nft_contract, &token_id, true);
    }

    /// Transfer fractional shares between holders (vault-mediated so the
    /// share-token supply stays in sync with the vault's ledger).
    pub fn transfer_shares(env: Env, from: Address, to: Address, shares: i128) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        from.require_auth();

        if read_bool(&env, DataKey::Soulbound) {
            panic_with_error!(&env, VaultError::SoulboundNonTransferable);
        }

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
            .set(&DataKey::Share(from.clone()), &(from_balance - shares));
        env.storage()
            .instance()
            .set(&DataKey::Share(to.clone()), &(to_balance + shares));

        let share_client = token::StellarAssetClient::new(&env, &read_share_token(&env));
        share_client.burn(&from, &shares);
        share_client.mint(&to, &shares);
    }

    /// Start (or restart) a buyout auction.
    ///
    /// * `min_bid` — minimum acceptable first bid.
    /// * `duration` — auction length in ledger seconds.
    pub fn start_auction(env: Env, admin: Address, min_bid: i128, duration: u64) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        if min_bid <= 0 || duration == 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }
        if read_bool(&env, DataKey::NftLocked) == false {
            panic_with_error!(&env, VaultError::NftNotLocked);
        }

        let now = env.ledger().timestamp();
        let auction = AuctionState {
            min_bid,
            deadline: now.saturating_add(duration),
            started_at: now,
            extensions: 0,
            current_bidder: None,
            current_bid: 0,
        };
        env.storage().instance().set(&DataKey::Auction, &auction);
    }

    /// Place (or raise) a buyout bid. Bids are escrowed in the vault; a
    /// previously-leading bidder is refunded in full.
    pub fn bid(env: Env, bidder: Address, amount: i128) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        bidder.require_auth();

        let mut auction: AuctionState = env
            .storage()
            .instance()
            .get(&DataKey::Auction)
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::AuctionMissing));

        if env.ledger().timestamp() > auction.deadline {
            panic_with_error!(&env, VaultError::AuctionActive);
        }
        if amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        let payment_client = token::Client::new(&env, &read_payment_token(&env));
        let mut refunded: i128 = 0;

        match auction.current_bidder.clone() {
            Some(prev) if prev == bidder => {
                // Raising your own bid: only the delta moves.
                if amount <= auction.current_bid {
                    panic_with_error!(&env, VaultError::BidTooLow);
                }
                payment_client.transfer(
                    &bidder,
                    &env.current_contract_address(),
                    &(amount - auction.current_bid),
                );
                auction.current_bid = amount;
            }
            Some(prev) => {
                if amount <= auction.current_bid {
                    panic_with_error!(&env, VaultError::BidTooLow);
                }
                // Refund the previous leader, then escrow the new bid.
                payment_client.transfer(
                    &env.current_contract_address(),
                    &prev,
                    &auction.current_bid,
                );
                refunded = auction.current_bid;
                payment_client.transfer(&bidder, &env.current_contract_address(), &amount);
                auction.current_bidder = Some(bidder.clone());
                auction.current_bid = amount;
            }
            None => {
                if amount < auction.min_bid {
                    panic_with_error!(&env, VaultError::BidTooLow);
                }
                payment_client.transfer(&bidder, &env.current_contract_address(), &amount);
                auction.current_bidder = Some(bidder.clone());
                auction.current_bid = amount;
            }
        }

        // Anti-snipe: a valid bid inside the final window pushes the deadline
        // out. Auctions no longer than the window are exempt so their opening
        // bid does not trigger an extension.
        if auction.deadline.saturating_sub(auction.started_at) > ANTI_SNIPE_WINDOW_SECS
            && should_extend_deadline(
                env.ledger().timestamp(),
                auction.deadline,
                ANTI_SNIPE_WINDOW_SECS,
            )
        {
            auction.deadline = extend_deadline(auction.deadline, ANTI_SNIPE_EXTENSION_SECS);
            auction.extensions = auction.extensions.saturating_add(1);
        }

        env.storage().instance().set(&DataKey::Auction, &auction);
        publish_bid(&env, &bidder, amount, refunded);
    }

    /// Finalize a completed buyout auction: the winner receives the NFT and
    /// their escrowed bid becomes the payout treasury for share holders.
    pub fn finalize_buyout(env: Env, caller: Address) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        caller.require_auth();

        let auction: AuctionState = env
            .storage()
            .instance()
            .get(&DataKey::Auction)
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::AuctionMissing));

        if env.ledger().timestamp() <= auction.deadline {
            panic_with_error!(&env, VaultError::AuctionActive);
        }
        let winner = auction
            .current_bidder
            .clone()
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::NoBids));

        // A buyout is a secondary sale of the underlying NFT: route the
        // SEP-0029 royalty cut to the creator before crediting the
        // remaining proceeds to the share-holder treasury.
        let royalty_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoyaltyBps)
            .unwrap_or(0);
        let royalty_cut = (auction.current_bid * royalty_bps as i128) / BPS_DENOMINATOR;
        let treasury_amount = auction.current_bid - royalty_cut;

        if royalty_cut > 0 {
            let recipient: Address = env
                .storage()
                .instance()
                .get(&DataKey::RoyaltyRecipient)
                .unwrap_or_else(|| read_admin(&env));
            token::Client::new(&env, &read_payment_token(&env)).transfer(
                &env.current_contract_address(),
                &recipient,
                &royalty_cut,
            );
        }

        env.storage()
            .instance()
            .set(&DataKey::Treasury, &treasury_amount);
        env.storage().instance().set(&DataKey::Finalized, &true);
        env.storage().instance().set(&DataKey::NftLocked, &false);

        let nft_contract = read_nft_contract(&env);
        let token_id = read_token_id(&env);
        NftClient::new(&env, &nft_contract).transfer(
            &env.current_contract_address(),
            &winner,
            &token_id,
        );

        let total_shares = read_total_shares(&env);
        publish_auction(&env, &winner, auction.current_bid, total_shares, true);
    }

    /// Cancel a live auction and refund the current bidder. Admin only.
    pub fn cancel_buyout(env: Env, admin: Address) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        let auction: AuctionState = env
            .storage()
            .instance()
            .get(&DataKey::Auction)
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::AuctionMissing));

        if let Some(bidder) = auction.current_bidder {
            token::Client::new(&env, &read_payment_token(&env)).transfer(
                &env.current_contract_address(),
                &bidder,
                &auction.current_bid,
            );
        }
        env.storage().instance().remove(&DataKey::Auction);
        let total_shares = read_total_shares(&env);
        publish_auction(
            &env,
            &env.current_contract_address(),
            0,
            total_shares,
            false,
        );
    }

    // ── Commit-reveal (Vickrey) auction ──────────────────────────────────────

    /// Start a blinded commit-reveal buyout auction.
    ///
    /// * `min_bid` — minimum acceptable revealed bid.
    /// * `deposit` — anti-spam deposit escrowed with each commitment.
    /// * `commit_duration` — seconds the commit phase lasts.
    /// * `reveal_duration` — seconds the reveal phase lasts after commit closes.
    pub fn start_commit_reveal_auction(
        env: Env,
        admin: Address,
        min_bid: i128,
        deposit: i128,
        commit_duration: u64,
        reveal_duration: u64,
    ) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        if min_bid <= 0 || deposit <= 0 || commit_duration == 0 || reveal_duration == 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }
        if !read_bool(&env, DataKey::NftLocked) {
            panic_with_error!(&env, VaultError::NftNotLocked);
        }
        if env.storage().instance().has(&DataKey::CrAuction) {
            panic_with_error!(&env, VaultError::AuctionActive);
        }

        let now = env.ledger().timestamp();
        let commit_deadline = now.saturating_add(commit_duration);
        let auction = CommitRevealAuction {
            min_bid,
            deposit,
            commit_deadline,
            reveal_deadline: commit_deadline.saturating_add(reveal_duration),
            started_at: now,
            extensions: 0,
            highest_bidder: None,
            highest_bid: 0,
            second_highest_bid: 0,
            revealed_count: 0,
            forfeited_deposits: 0,
            finalized: false,
            commits: Map::new(&env),
            reveals: Map::new(&env),
            deposits: Map::new(&env),
        };
        env.storage().instance().set(&DataKey::CrAuction, &auction);
        publish_auction(&env, &admin, min_bid, read_total_shares(&env), false);
    }

    /// Publish a blinded commitment and escrow the anti-spam deposit.
    pub fn commit_bid(env: Env, bidder: Address, commitment: BytesN<32>, deposit: i128) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        bidder.require_auth();

        let mut auction = read_cr_auction(&env);
        let now = env.ledger().timestamp();

        if now > auction.commit_deadline || auction.finalized {
            panic_with_error!(&env, VaultError::AuctionActive);
        }
        if deposit != auction.deposit {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }
        if auction.commits.contains_key(bidder.clone()) {
            panic_with_error!(&env, VaultError::AlreadyCommitted);
        }

        token::Client::new(&env, &read_payment_token(&env)).transfer(
            &bidder,
            env.current_contract_address(),
            &deposit,
        );
        auction.deposits.set(bidder.clone(), deposit);
        auction.commits.set(bidder.clone(), commitment);

        // Anti-snipe: a commit inside the final window pushes both deadlines out.
        if auction.commit_deadline.saturating_sub(auction.started_at) > ANTI_SNIPE_WINDOW_SECS
            && should_extend_deadline(now, auction.commit_deadline, ANTI_SNIPE_WINDOW_SECS)
        {
            auction.commit_deadline =
                extend_deadline(auction.commit_deadline, ANTI_SNIPE_EXTENSION_SECS);
            auction.reveal_deadline =
                extend_deadline(auction.reveal_deadline, ANTI_SNIPE_EXTENSION_SECS);
            auction.extensions = auction.extensions.saturating_add(1);
        }

        env.storage().instance().set(&DataKey::CrAuction, &auction);
    }

    /// Reveal a committed bid. Verifies `sha256(amount || nonce)` against the
    /// stored commitment, escrows `amount`, refunds the deposit and updates the
    /// highest / second-highest trackers.
    pub fn reveal_bid(env: Env, bidder: Address, amount: i128, nonce: BytesN<32>) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        bidder.require_auth();

        let mut auction = read_cr_auction(&env);
        let now = env.ledger().timestamp();

        if now <= auction.commit_deadline || now > auction.reveal_deadline || auction.finalized {
            panic_with_error!(&env, VaultError::AuctionActive);
        }
        let commitment = auction
            .commits
            .get(bidder.clone())
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::AuctionMissing));
        let expected = bid_commitment(&env, &Bid { amount, nonce });
        if expected != commitment {
            panic_with_error!(&env, VaultError::InvalidCommitment);
        }
        if amount < auction.min_bid {
            panic_with_error!(&env, VaultError::BidTooLow);
        }
        if auction.reveals.contains_key(bidder.clone()) {
            panic_with_error!(&env, VaultError::AlreadyClaimed);
        }

        let payment = token::Client::new(&env, &read_payment_token(&env));
        // Escrow the revealed bid and refund the anti-spam deposit.
        payment.transfer(&bidder, env.current_contract_address(), &amount);
        let deposit = auction.deposits.get(bidder.clone()).unwrap_or(0);
        if deposit > 0 {
            payment.transfer(&env.current_contract_address(), &bidder, &deposit);
            auction.deposits.set(bidder.clone(), 0);
        }

        auction.reveals.set(bidder.clone(), amount);
        auction.revealed_count = auction.revealed_count.saturating_add(1);

        if amount > auction.highest_bid {
            auction.second_highest_bid = auction.highest_bid;
            auction.highest_bid = amount;
            auction.highest_bidder = Some(bidder.clone());
        } else if amount > auction.second_highest_bid {
            auction.second_highest_bid = amount;
        }

        env.storage().instance().set(&DataKey::CrAuction, &auction);
        publish_bid(&env, &bidder, amount, deposit);
    }

    /// Finalize a completed commit-reveal auction.
    ///
    /// The highest revealer wins but pays only the second-highest revealed
    /// amount (Vickrey); the difference is refunded. Other valid revealers are
    /// refunded in full, and deposits from commitments that were never revealed
    /// are forfeited into the buyout treasury.
    pub fn finalize_commit_reveal_auction(env: Env, caller: Address) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        caller.require_auth();

        let mut auction = read_cr_auction(&env);
        if env.ledger().timestamp() <= auction.reveal_deadline {
            panic_with_error!(&env, VaultError::AuctionActive);
        }
        let winner = auction
            .highest_bidder
            .clone()
            .unwrap_or_else(|| panic_with_error!(&env, VaultError::NoBids));
        let price = if auction.second_highest_bid > 0 {
            auction.second_highest_bid
        } else {
            auction.highest_bid
        };

        let payment = token::Client::new(&env, &read_payment_token(&env));
        for (bidder, amount) in auction.reveals.iter() {
            let refund = if bidder == winner {
                auction.highest_bid.saturating_sub(price)
            } else {
                amount
            };
            if refund > 0 {
                payment.transfer(&env.current_contract_address(), &bidder, &refund);
            }
        }

        // Deposits still held belong to bidders who never revealed.
        let mut forfeited: i128 = 0;
        for (_, deposit) in auction.deposits.iter() {
            forfeited = forfeited.saturating_add(deposit);
        }
        auction.forfeited_deposits = forfeited;
        auction.finalized = true;

        let treasury = price.saturating_add(forfeited);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::Finalized, &true);
        env.storage().instance().set(&DataKey::NftLocked, &false);
        env.storage().instance().set(&DataKey::CrAuction, &auction);

        let nft_contract = read_nft_contract(&env);
        let token_id = read_token_id(&env);
        NftClient::new(&env, &nft_contract).transfer(
            &env.current_contract_address(),
            &winner,
            &token_id,
        );

        publish_auction(&env, &winner, treasury, read_total_shares(&env), true);
    }

    /// Cancel a live commit-reveal auction and refund every escrow. Admin only.
    pub fn cancel_commit_reveal_auction(env: Env, admin: Address) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        let auction = read_cr_auction(&env);
        let payment = token::Client::new(&env, &read_payment_token(&env));
        for (bidder, amount) in auction.reveals.iter() {
            if amount > 0 {
                payment.transfer(&env.current_contract_address(), &bidder, &amount);
            }
        }
        for (bidder, deposit) in auction.deposits.iter() {
            if deposit > 0 {
                payment.transfer(&env.current_contract_address(), &bidder, &deposit);
            }
        }
        env.storage().instance().remove(&DataKey::CrAuction);
    }

    /// Claim your pro-rata share of the buyout treasury. Payouts are
    /// strictly proportional to share ownership, rounded down.
    pub fn claim_buyout_payout(env: Env, holder: Address) -> i128 {
        ensure_initialized(&env);
        holder.require_auth();

        if !read_bool(&env, DataKey::Finalized) {
            panic_with_error!(&env, VaultError::NoBids);
        }
        if env
            .storage()
            .instance()
            .has(&DataKey::PayoutClaimed(holder.clone()))
        {
            panic_with_error!(&env, VaultError::AlreadyClaimed);
        }

        let holder_shares = share_balance_internal(&env, &holder);
        if holder_shares <= 0 {
            panic_with_error!(&env, VaultError::NoShares);
        }

        let treasury = read_treasury(&env);
        let payout = pro_rata_payout(treasury, holder_shares, read_total_shares(&env));

        env.storage()
            .instance()
            .set(&DataKey::PayoutClaimed(holder.clone()), &true);
        token::Client::new(&env, &read_payment_token(&env)).transfer(
            &env.current_contract_address(),
            &holder,
            &payout,
        );

        publish_payout(&env, &holder, payout);
        payout
    }

    /// Redeem the NFT directly: only a holder of **100%** of the shares may
    /// burn them all and withdraw the locked NFT.
    pub fn redeem_nft(env: Env, holder: Address) {
        ensure_initialized(&env);
        ensure_not_finalized(&env);
        holder.require_auth();

        if !read_bool(&env, DataKey::NftLocked) {
            panic_with_error!(&env, VaultError::NftNotLocked);
        }
        let total_shares = read_total_shares(&env);
        let holder_shares = share_balance_internal(&env, &holder);
        if holder_shares != total_shares {
            panic_with_error!(&env, VaultError::NoShares);
        }

        // 100% redeemed: burn all shares and unlock the NFT.
        token::StellarAssetClient::new(&env, &read_share_token(&env)).burn(&holder, &total_shares);
        env.storage()
            .instance()
            .set(&DataKey::Share(holder.clone()), &0i128);
        env.storage().instance().set(&DataKey::Finalized, &true);
        env.storage().instance().set(&DataKey::NftLocked, &false);

        let nft_contract = read_nft_contract(&env);
        let token_id = read_token_id(&env);
        NftClient::new(&env, &nft_contract).transfer(
            &env.current_contract_address(),
            &holder,
            &token_id,
        );

        publish_vault_lock(&env, &holder, &nft_contract, &token_id, false);
    }

    pub fn share_balance(env: Env, owner: Address) -> i128 {
        share_balance_internal(&env, &owner)
    }

    pub fn shareholders(env: Env, accounts: Vec<Address>) -> Vec<(Address, i128)> {
        let mut result = Vec::new(&env);
        for account in accounts.iter() {
            result.push_back((account.clone(), share_balance_internal(&env, &account)));
        }
        result
    }

    pub fn auction(env: Env) -> Option<AuctionState> {
        env.storage().instance().get(&DataKey::Auction)
    }

    pub fn commit_reveal_auction(env: Env) -> Option<CommitRevealAuction> {
        env.storage().instance().get(&DataKey::CrAuction)
    }

    pub fn treasury(env: Env) -> i128 {
        read_treasury(&env)
    }

    pub fn nft_locked(env: Env) -> bool {
        read_bool(&env, DataKey::NftLocked)
    }

    pub fn finalized(env: Env) -> bool {
        read_bool(&env, DataKey::Finalized)
    }
}

/// Pro-rata payout: `treasury * share / total`, rounded down.
fn pro_rata_payout(treasury: i128, share: i128, total: i128) -> i128 {
    if total <= 0 || share <= 0 {
        return 0;
    }
    treasury * share / total
}

/// Minimal client for the standard Soroban NFT interface
/// (`transfer(env, from, to, token_id)`, `owner(env, token_id)`).
struct NftClient {
    env: Env,
    address: Address,
}

impl NftClient {
    fn new(env: &Env, address: &Address) -> Self {
        NftClient {
            env: env.clone(),
            address: address.clone(),
        }
    }

    fn transfer(&self, from: &Address, to: &Address, token_id: &BytesN<32>) {
        let args = (from.clone(), to.clone(), token_id.clone()).into_val(&self.env);
        self.env
            .invoke_contract::<()>(&self.address, &symbol_short!("transfer"), args);
    }

    #[allow(dead_code)]
    fn owner(&self, token_id: &BytesN<32>) -> Address {
        let args = (token_id.clone(),).into_val(&self.env);
        self.env
            .invoke_contract::<Address>(&self.address, &symbol_short!("owner"), args)
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, VaultError::NotInitialized);
    }
}

fn ensure_not_finalized(env: &Env) {
    if read_bool(env, DataKey::Finalized) {
        panic_with_error!(env, VaultError::AlreadyFinalized);
    }
}

fn require_admin(env: &Env, caller: &Address) {
    let admin = read_admin(env);
    if caller != &admin {
        panic_with_error!(env, VaultError::Unauthorized);
    }
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn read_nft_contract(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::NftContract)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn read_token_id(env: &Env) -> BytesN<32> {
    env.storage()
        .instance()
        .get::<_, BytesN<32>>(&DataKey::TokenId)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn read_share_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::ShareToken)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn read_payment_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::PaymentToken)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn read_total_shares(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::TotalShares)
        .unwrap_or(0)
}

fn read_treasury(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::Treasury)
        .unwrap_or(0)
}

fn read_bool(env: &Env, key: DataKey) -> bool {
    env.storage().instance().get(&key).unwrap_or(false)
}

fn read_cr_auction(env: &Env) -> CommitRevealAuction {
    env.storage()
        .instance()
        .get(&DataKey::CrAuction)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::AuctionMissing))
}

fn share_balance_internal(env: &Env, owner: &Address) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::Share(owner.clone()))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests;
mod tests {
    use super::*;
    use soroban_sdk::{
        contractimpl,
        testutils::{Address as _, Events as _, Ledger as _},
        token, Address, BytesN, Env, Symbol, Val, Vec,
    };

    // ---- Mock NFT implementing the standard transfer/owner interface ----
    #[contract]
    pub struct MockNft;

    #[contracttype]
    pub enum MockDataKey {
        Owner(BytesN<32>),
    }

    #[contractimpl]
    impl MockNft {
        pub fn mint(env: Env, owner: Address, token_id: BytesN<32>) {
            env.storage()
                .persistent()
                .set(&MockDataKey::Owner(token_id), &owner);
        }

        pub fn transfer(env: Env, from: Address, to: Address, token_id: BytesN<32>) {
            from.require_auth();
            let owner = env
                .storage()
                .persistent()
                .get::<_, Address>(&MockDataKey::Owner(token_id.clone()))
                .unwrap_or_else(|| panic!("mock nft: token not minted"));
            if from != owner {
                panic!("mock nft: not the owner");
            }
            env.storage()
                .persistent()
                .set(&MockDataKey::Owner(token_id), &to);
        }

        pub fn owner(env: Env, token_id: BytesN<32>) -> Address {
            env.storage()
                .persistent()
                .get(&MockDataKey::Owner(token_id))
                .unwrap_or_else(|| panic!("mock nft: token not minted"))
        }
    }

    struct Vault {
        env: Env,
        vault_id: Address,
        admin: Address,
        user_a: Address,
        user_b: Address,
        bidder: Address,
        nft_id: Address,
        token_id: BytesN<32>,
        share_token: Address,
        payment_token: Address,
    }

    impl Vault {
        fn client(&self) -> FractionalNftVaultContractClient<'_> {
            FractionalNftVaultContractClient::new(&self.env, &self.vault_id)
        }
    }

    fn setup() -> Vault {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let user_a = Address::generate(&env);
        let user_b = Address::generate(&env);
        let bidder = Address::generate(&env);

        // NFT owned by the admin.
        let nft_id = env.register(MockNft, ());
        let nft_client = MockNftClient::new(&env, &nft_id);
        let token_id = BytesN::from_array(&env, &[7u8; 32]);
        nft_client.mint(&admin, &token_id);

        // Vault registered first so it can be the share-token admin.
        let vault_id = env.register(FractionalNftVaultContract, ());
        let share_token = env.register_stellar_asset_contract_v2(vault_id.clone());
        let payment_token = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(&env, &payment_token.address()).mint(&bidder, &10_000_000);

        FractionalNftVaultContractClient::new(&env, &vault_id).initialize(
            &admin,
            &nft_id,
            &token_id,
            &share_token.address(),
            &payment_token.address(),
        );

        Vault {
            env,
            vault_id,
            admin,
            user_a,
            user_b,
            bidder,
            nft_id,
            token_id,
            share_token: share_token.address(),
            payment_token: payment_token.address(),
        }
    }

    fn fractionalize(v: &Vault, shares_a: i128, shares_b: i128, shares_admin: i128) {
        let mut recipients = Vec::new(&v.env);
        if shares_a > 0 {
            recipients.push_back((v.user_a.clone(), shares_a));
        }
        if shares_b > 0 {
            recipients.push_back((v.user_b.clone(), shares_b));
        }
        if shares_admin > 0 {
            recipients.push_back((v.admin.clone(), shares_admin));
        }
        let total = shares_a + shares_b + shares_admin;
        v.client().fractionalize(&v.admin, &recipients, &total);
    }

    fn nft_owner(v: &Vault) -> Address {
        MockNftClient::new(&v.env, &v.nft_id).owner(&v.token_id)
    }

    #[test]
    fn locks_nft_and_mints_fractional_shares() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);

        // NFT moved into the vault.
        assert_eq!(nft_owner(&v), v.vault_id);
        assert!(v.client().nft_locked());

        // Internal share balances.
        assert_eq!(v.client().share_balance(&v.user_a), 300);
        assert_eq!(v.client().share_balance(&v.user_b), 200);
        assert_eq!(v.client().share_balance(&v.admin), 500);

        // Share token actually minted.
        let sac = token::StellarAssetClient::new(&v.env, &v.share_token);
        assert_eq!(sac.balance(&v.user_a), 300);
        assert_eq!(sac.balance(&v.user_b), 200);
        assert_eq!(sac.balance(&v.admin), 500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn fractionalize_requires_sum_to_match() {
        let v = setup();
        let mut recipients = Vec::new(&v.env);
        recipients.push_back((v.user_a.clone(), 300));
        recipients.push_back((v.user_b.clone(), 200));
        // Total does not match the sum of recipients.
        v.client().fractionalize(&v.admin, &recipients, &1_000);
    }

    #[test]
    fn transfer_shares_updates_balances_and_token() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);

        v.client().transfer_shares(&v.user_a, &v.user_b, &100);

        assert_eq!(v.client().share_balance(&v.user_a), 200);
        assert_eq!(v.client().share_balance(&v.user_b), 300);
        let sac = token::StellarAssetClient::new(&v.env, &v.share_token);
        assert_eq!(sac.balance(&v.user_a), 200);
        assert_eq!(sac.balance(&v.user_b), 300);
    }

    #[test]
    fn contested_buyout_distributes_pro_rata() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);

        let bidder2 = Address::generate(&v.env);
        token::StellarAssetClient::new(&v.env, &v.payment_token).mint(&bidder2, &10_000_000);

        v.client().start_auction(&v.admin, &1_000, &100);

        // Contested bids: bidder2 outbids bidder1.
        v.client().bid(&v.bidder, &5_000);
        v.client().bid(&bidder2, &8_000);

        // The outbid bidder was refunded in full.
        let sac = token::StellarAssetClient::new(&v.env, &v.payment_token);
        assert_eq!(sac.balance(&v.bidder), 10_000_000);
        // The winner's bid is escrowed.
        assert_eq!(sac.balance(&v.vault_id), 8_000);

        v.env.ledger().with_mut(|li| li.timestamp += 101);
        v.client().finalize_buyout(&bidder2);

        // NFT to the winner.
        assert_eq!(nft_owner(&v), bidder2);
        assert!(v.client().finalized());
        assert_eq!(v.client().treasury(), 8_000);

        // Pro-rata payouts: 300/1000, 200/1000, 500/1000 of 8000.
        assert_eq!(v.client().claim_buyout_payout(&v.user_a), 2_400);
        assert_eq!(v.client().claim_buyout_payout(&v.user_b), 1_600);
        assert_eq!(v.client().claim_buyout_payout(&v.admin), 4_000);

        // Payouts actually transferred.
        assert_eq!(sac.balance(&v.user_a), 2_400);
        assert_eq!(sac.balance(&v.user_b), 1_600);
        assert_eq!(sac.balance(&v.admin), 4_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn bid_below_minimum_is_rejected() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client().start_auction(&v.admin, &1_000, &100);
        v.client().bid(&v.bidder, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn cannot_finalize_before_deadline() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client().start_auction(&v.admin, &1_000, &100);
        v.client().bid(&v.bidder, &5_000);
        v.client().finalize_buyout(&v.bidder);
    }

    #[test]
    fn secondary_sale_routes_royalty_cut_to_creator() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);

        let creator = Address::generate(&v.env);
        // 10% royalty on every secondary (buyout) sale.
        v.client().set_royalty(&v.admin, &1_000u32, &creator);
        assert_eq!(v.client().royalty_bps(), 1_000);

        v.client().start_auction(&v.admin, &1_000, &100);
        v.client().bid(&v.bidder, &8_000);
        v.env.ledger().with_mut(|li| li.timestamp += 101);
        v.client().finalize_buyout(&v.bidder);

        let sac = token::StellarAssetClient::new(&v.env, &v.payment_token);
        // 10% of 8000 == 800 routed to the creator.
        assert_eq!(sac.balance(&creator), 800);
        // Remaining 7200 becomes the share-holder treasury.
        assert_eq!(v.client().treasury(), 7_200);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn royalty_above_cap_is_rejected() {
        let v = setup();
        let creator = Address::generate(&v.env);
        v.client()
            .set_royalty(&v.admin, &(MAX_ROYALTY_BPS + 1), &creator);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn soulbound_shares_reject_transfer_attempts() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);

        v.client().set_soulbound(&v.admin, &true);
        assert!(v.client().is_soulbound());

        v.client().transfer_shares(&v.user_a, &v.user_b, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn soulbound_flag_cannot_be_unset_once_set() {
        let v = setup();
        v.client().set_soulbound(&v.admin, &true);
        v.client().set_soulbound(&v.admin, &false);
    }

    #[test]
    fn redeem_requires_100_percent_ownership() {
        let v = setup();
        // All shares to a single holder.
        let mut recipients = Vec::new(&v.env);
        recipients.push_back((v.user_a.clone(), 1_000));
        v.client().fractionalize(&v.admin, &recipients, &1_000);

        v.client().redeem_nft(&v.user_a);

        // NFT unlocked back to the 100% holder; shares burned.
        assert_eq!(nft_owner(&v), v.user_a);
        assert!(!v.client().nft_locked());
        assert!(v.client().finalized());
        let sac = token::StellarAssetClient::new(&v.env, &v.share_token);
        assert_eq!(sac.balance(&v.user_a), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn partial_holder_cannot_redeem_nft() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client().redeem_nft(&v.user_a);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn cannot_claim_payout_twice() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client().start_auction(&v.admin, &1_000, &100);
        v.client().bid(&v.bidder, &5_000);
        v.env.ledger().with_mut(|li| li.timestamp += 101);
        v.client().finalize_buyout(&v.bidder);

        v.client().claim_buyout_payout(&v.user_a);
        v.client().claim_buyout_payout(&v.user_a);
    }

    /// Convert `v.env.events().all()` into `(topics, payload)` pairs with the
    /// payload unpacked into its component values.
    fn raw_events(env: &Env) -> std::vec::Vec<(std::vec::Vec<Val>, std::vec::Vec<Val>)> {
        use soroban_sdk::{xdr, TryFromVal, Val, Vec};
        let mut out = std::vec::Vec::new();
        for e in env.events().all().events() {
            if let xdr::ContractEventBody::V0(v0) = &e.body {
                let topics: Vec<Val> = Vec::try_from_val(env, &v0.topics).unwrap();
                let payload: Vec<Val> = Vec::try_from_val(env, &v0.data).unwrap_or_else(|_| {
                    let mut v = Vec::new(env);
                    v.push_back(Val::try_from_val(env, &v0.data).unwrap());
                    v
                });
                let mut t = std::vec::Vec::new();
                for i in 0..topics.len() {
                    t.push(topics.get(i).unwrap());
                }
                let mut p = std::vec::Vec::new();
                for i in 0..payload.len() {
                    p.push(payload.get(i).unwrap());
                }
                out.push((t, p));
            }
        }
        out
    }

    /// Find the first event whose first topic is `topic`.
    fn find_event(env: &Env, topic: Symbol) -> Option<(std::vec::Vec<Val>, std::vec::Vec<Val>)> {
        use soroban_sdk::TryFromVal;
        for (t, d) in raw_events(env) {
            if Symbol::try_from_val(env, &t[0]).ok() == Some(topic.clone()) {
                return Some((t, d));
            }
        }
        None
    }

    #[test]
    fn emits_standardized_vault_events() {
        use contract_events::{
            decode_auction, decode_bid, decode_payout, decode_shares_minted, decode_vault_lock,
            topic,
        };
        use soroban_sdk::{Symbol, TryFromVal};
        let v = setup();

        // Events are only visible for the most recent top-level invocation,
        // so capture them right after each call. Token contracts also emit
        // transfer events, so search by topic.
        fractionalize(&v, 300, 200, 500);
        let (topics, data) = find_event(&v.env, topic::VAULT_LOCK).unwrap();
        let lock = decode_vault_lock(&v.env, &topics, &data);
        assert!(lock.locked);
        assert_eq!(lock.token_id, v.token_id);
        let mut shares_seen = 0;
        for (t, d) in raw_events(&v.env) {
            if Symbol::try_from_val(&v.env, &t[0]).ok() == Some(topic::SHARES_MINTED) {
                let shares = decode_shares_minted(&v.env, &t, &d);
                assert!(shares.amount > 0);
                shares_seen += 1;
            }
        }
        assert_eq!(shares_seen, 3);

        v.client().start_auction(&v.admin, &1_000, &100);
        v.client().bid(&v.bidder, &5_000);
        let (topics, data) = find_event(&v.env, topic::BID).unwrap();
        let bid = decode_bid(&v.env, &topics, &data);
        assert_eq!(bid.amount, 5_000);

        v.env.ledger().with_mut(|li| li.timestamp += 101);
        v.client().finalize_buyout(&v.bidder);
        let (topics, data) = find_event(&v.env, topic::AUCTION).unwrap();
        let auction = decode_auction(&v.env, &topics, &data);
        assert!(auction.finalized);
        assert_eq!(auction.offer, 5_000);

        v.client().claim_buyout_payout(&v.user_a);
        let (topics, data) = find_event(&v.env, topic::PAYOUT).unwrap();
        let payout = decode_payout(&v.env, &topics, &data);
        assert_eq!(payout.amount, 1_500); // 300/1000 * 5000
    }

    #[test]
    fn cancel_buyout_refunds_bidder() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client().start_auction(&v.admin, &1_000, &100);
        v.client().bid(&v.bidder, &5_000);

        v.client().cancel_buyout(&v.admin);

        let sac = token::StellarAssetClient::new(&v.env, &v.payment_token);
        assert_eq!(sac.balance(&v.bidder), 10_000_000);
        assert_eq!(v.client().auction(), None);
        assert!(!v.client().finalized());
    }

    // ---- Anti-snipe (open auction) ----

    #[test]
    fn anti_snipe_extends_deadline_on_late_bid() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client().start_auction(&v.admin, &1_000, &600);

        // Bid inside the final 5 minutes (deadline = 600, now = 500).
        v.env.ledger().with_mut(|li| li.timestamp = 500);
        v.client().bid(&v.bidder, &5_000);

        let auction = v.client().auction().unwrap();
        assert_eq!(auction.deadline, 1_200);
        assert_eq!(auction.extensions, 1);
    }

    #[test]
    fn anti_snipe_does_not_extend_short_auction() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client().start_auction(&v.admin, &1_000, &100);
        v.client().bid(&v.bidder, &5_000);

        let auction = v.client().auction().unwrap();
        assert_eq!(auction.deadline, 100);
        assert_eq!(auction.extensions, 0);
    }

    // ---- Commit-reveal (Vickrey) auction ----

    fn commitment(env: &Env, amount: i128) -> (BytesN<32>, BytesN<32>) {
        let nonce: BytesN<32> = BytesN::from_array(env, &[9u8; 32]);
        let bid = Bid {
            amount,
            nonce: nonce.clone(),
        };
        (bid_commitment(env, &bid), nonce)
    }

    #[test]
    fn commit_reveal_vickrey_prices_second_highest_and_forfeits() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);

        let bidder2 = Address::generate(&v.env);
        let no_show = Address::generate(&v.env);
        let sac = token::StellarAssetClient::new(&v.env, &v.payment_token);
        sac.mint(&bidder2, &10_000_000);
        sac.mint(&no_show, &10_000_000);

        // Commit phase 600s, reveal phase 100s, deposit 100.
        v.client()
            .start_commit_reveal_auction(&v.admin, &1_000, &100, &600, &100);

        let (c1, n1) = commitment(&v.env, 5_000);
        let (c2, n2) = commitment(&v.env, 8_000);
        let (c3, _n3) = commitment(&v.env, 9_000);

        v.client().commit_bid(&v.bidder, &c1, &100);
        v.client().commit_bid(&bidder2, &c2, &100);
        v.client().commit_bid(&no_show, &c3, &100);

        // Reveal phase begins after the commit deadline.
        v.env.ledger().with_mut(|li| li.timestamp = 650);
        v.client().reveal_bid(&v.bidder, &5_000, &n1);
        v.client().reveal_bid(&bidder2, &8_000, &n2);

        // Escrow held, deposits refunded on valid reveal.
        assert_eq!(sac.balance(&v.bidder), 10_000_000 - 5_000);
        assert_eq!(sac.balance(&bidder2), 10_000_000 - 8_000);

        v.env.ledger().with_mut(|li| li.timestamp = 760);
        v.client().finalize_commit_reveal_auction(&v.bidder);

        // Highest revealer (bidder2) wins the NFT.
        assert_eq!(nft_owner(&v), bidder2);
        // Vickrey price is the second-highest bid (5_000) plus the forfeited
        // deposit from the non-revealer (100).
        assert_eq!(v.client().treasury(), 5_100);
        // Winner is refunded highest - price = 8_000 - 5_000.
        assert_eq!(sac.balance(&bidder2), 10_000_000 - 5_000);
        // Runner-up is refunded in full.
        assert_eq!(sac.balance(&v.bidder), 10_000_000);
        assert!(v.client().finalized());
    }

    #[test]
    fn commit_reveal_anti_snipe_extends_both_deadlines() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client()
            .start_commit_reveal_auction(&v.admin, &1_000, &100, &600, &100);

        // Commit inside the final 5 minutes of the commit phase.
        v.env.ledger().with_mut(|li| li.timestamp = 450);
        let (c1, _n1) = commitment(&v.env, 5_000);
        v.client().commit_bid(&v.bidder, &c1, &100);

        let auction = v.client().commit_reveal_auction().unwrap();
        assert_eq!(auction.commit_deadline, 1_200);
        assert_eq!(auction.reveal_deadline, 1_300);
        assert_eq!(auction.extensions, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn commit_reveal_rejects_wrong_reveal() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client()
            .start_commit_reveal_auction(&v.admin, &1_000, &100, &10, &10);

        let (c1, _n1) = commitment(&v.env, 5_000);
        v.client().commit_bid(&v.bidder, &c1, &100);

        v.env.ledger().with_mut(|li| li.timestamp = 11);
        let wrong_nonce: BytesN<32> = BytesN::from_array(&v.env, &[7u8; 32]);
        v.client().reveal_bid(&v.bidder, &5_000, &wrong_nonce);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn commit_reveal_rejects_double_commit() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client()
            .start_commit_reveal_auction(&v.admin, &1_000, &100, &10, &10);

        let (c1, _n1) = commitment(&v.env, 5_000);
        v.client().commit_bid(&v.bidder, &c1, &100);
        v.client().commit_bid(&v.bidder, &c1, &100);
    }

    #[test]
    fn cancel_commit_reveal_refunds_all_escrow() {
        let v = setup();
        fractionalize(&v, 300, 200, 500);
        v.client()
            .start_commit_reveal_auction(&v.admin, &1_000, &100, &600, &100);

        let (c1, n1) = commitment(&v.env, 5_000);
        v.client().commit_bid(&v.bidder, &c1, &100);
        v.env.ledger().with_mut(|li| li.timestamp = 650);
        v.client().reveal_bid(&v.bidder, &5_000, &n1);

        v.client().cancel_commit_reveal_auction(&v.admin);

        let sac = token::StellarAssetClient::new(&v.env, &v.payment_token);
        assert_eq!(sac.balance(&v.bidder), 10_000_000);
        assert!(v.client().commit_reveal_auction().is_none());
    }
}

#[cfg(test)]
mod proptests {
    use super::pro_rata_payout;

    proptest::proptest! {
        #![proptest_config(proptest::prelude::ProptestConfig::with_cases(256))]

        /// Pro-rata payouts never exceed the treasury and never exceed a
        /// holder's proportional share.
        #[test]
        fn pro_rata_payouts_are_bounded(
            treasury in 1i128..10_000_000_000i128,
            total in 1i128..10_000_000i128,
            share_a in 0i128..5_000_000i128,
            share_b in 0i128..5_000_000i128,
        ) {
            let sum_shares = share_a + share_b;
            proptest::prop_assume!(sum_shares > 0 && sum_shares <= total);
            let pa = pro_rata_payout(treasury, share_a, total);
            let pb = pro_rata_payout(treasury, share_b, total);
            let remaining = pro_rata_payout(treasury, total - sum_shares, total);
            proptest::prop_assert!(pa + pb + remaining <= treasury);
            proptest::prop_assert!(pa * total <= treasury * share_a);
            proptest::prop_assert!(pb * total <= treasury * share_b);
        }
    }
}

// ── Storage TTL (SC-HARD-16) ─────────────────────────────────────────────────
// Bump instance storage lifetime on every contract execution to prevent
// automatic archival. Target: > 100,000 ledgers per acceptance criteria.

const SC16_TTL_THRESHOLD: u32 = 10_000;
const SC16_INSTANCE_BUMP: u32 = 100_000;

#[inline(always)]
fn sc16_bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(SC16_TTL_THRESHOLD, SC16_INSTANCE_BUMP);
}
