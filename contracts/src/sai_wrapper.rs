/// #131 – Stellar Asset Interface (SAI) Wrapper
///
/// Wraps native Stellar Assets (XLM, USDC, etc.) via their Stellar Asset
/// Contract (SAC) to let the lab accept payments for premium certificates.
///
/// Uses the Soroban `token` interface to interact with the SAC and verifies
/// transfer completion before proceeding with any contract logic.
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    Map, Symbol,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum SaiKey {
    /// Admin address that can manage the wrapper.
    Admin,
    /// Address that receives payments (treasury).
    Treasury,
    /// Map of asset symbol → SAC address for accepted assets.
    AcceptedAssets,
    /// Price in base units for a premium certificate (per asset).
    CertPrice(Address),
    /// Whether `payer` has a valid premium payment on record.
    PremiumPaid(Address),
    /// Total payments collected per asset.
    TotalCollected(Address),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SaiError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AssetNotAccepted = 4,
    TransferFailed = 5,
    InsufficientBalance = 6,
    InvalidAmount = 7,
    AlreadyPaid = 8,
    NoPriceSet = 9,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct SaiWrapperContract;

#[contractimpl]
impl SaiWrapperContract {
    /// One-time initialisation: set admin, treasury, and an initial accepted
    /// asset with its certificate price.
    ///
    /// `asset_contract` – address of the SAC (e.g. native XLM SAC).
    /// `treasury`       – address that receives all payments.
    /// `cert_price`     – price in token base-units for one premium certificate.
    pub fn init(
        env: Env,
        admin: Address,
        treasury: Address,
        asset_contract: Address,
        cert_price: i128,
    ) {
        if env.storage().instance().has(&SaiKey::Admin) {
            panic_with_error!(&env, SaiError::AlreadyInitialized);
        }
        if cert_price <= 0 {
            panic_with_error!(&env, SaiError::InvalidAmount);
        }

        env.storage().instance().set(&SaiKey::Admin, &admin);
        env.storage().instance().set(&SaiKey::Treasury, &treasury);

        // Register the first accepted asset.
        let mut assets: Map<Address, bool> = Map::new(&env);
        assets.set(asset_contract.clone(), true);
        env.storage()
            .instance()
            .set(&SaiKey::AcceptedAssets, &assets);

        // Set its certificate price.
        env.storage()
            .instance()
            .set(&SaiKey::CertPrice(asset_contract.clone()), &cert_price);

        // Initialise collected counter.
        env.storage()
            .instance()
            .set(&SaiKey::TotalCollected(asset_contract), &0i128);
    }

    // -----------------------------------------------------------------------
    // Admin helpers
    // -----------------------------------------------------------------------

    fn require_admin(env: &Env, caller: &Address) {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&SaiKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, SaiError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, SaiError::Unauthorized);
        }
    }

    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&SaiKey::Admin) {
            panic_with_error!(env, SaiError::NotInitialized);
        }
    }

    // -----------------------------------------------------------------------
    // Asset management (admin-only)
    // -----------------------------------------------------------------------

    /// Register an additional SAC so the lab can accept payments in that asset.
    pub fn add_accepted_asset(env: Env, admin: Address, asset_contract: Address, cert_price: i128) {
        Self::require_admin(&env, &admin);
        if cert_price <= 0 {
            panic_with_error!(&env, SaiError::InvalidAmount);
        }

        let mut assets: Map<Address, bool> = env
            .storage()
            .instance()
            .get(&SaiKey::AcceptedAssets)
            .unwrap_or_else(|| Map::new(&env));

        assets.set(asset_contract.clone(), true);
        env.storage()
            .instance()
            .set(&SaiKey::AcceptedAssets, &assets);

        env.storage()
            .instance()
            .set(&SaiKey::CertPrice(asset_contract.clone()), &cert_price);

        if !env
            .storage()
            .instance()
            .has(&SaiKey::TotalCollected(asset_contract.clone()))
        {
            env.storage()
                .instance()
                .set(&SaiKey::TotalCollected(asset_contract.clone()), &0i128);
        }

        env.events().publish(
            (Symbol::new(&env, "sai_asset_added"),),
            (admin, asset_contract, cert_price),
        );
    }

    /// Remove an asset from the accepted list.
    pub fn remove_accepted_asset(env: Env, admin: Address, asset_contract: Address) {
        Self::require_admin(&env, &admin);

        let mut assets: Map<Address, bool> = env
            .storage()
            .instance()
            .get(&SaiKey::AcceptedAssets)
            .unwrap_or_else(|| Map::new(&env));

        assets.remove(asset_contract.clone());
        env.storage()
            .instance()
            .set(&SaiKey::AcceptedAssets, &assets);

        env.events().publish(
            (Symbol::new(&env, "sai_asset_removed"),),
            (admin, asset_contract),
        );
    }

    /// Update the certificate price for an accepted asset.
    pub fn set_cert_price(env: Env, admin: Address, asset_contract: Address, new_price: i128) {
        Self::require_admin(&env, &admin);
        if new_price <= 0 {
            panic_with_error!(&env, SaiError::InvalidAmount);
        }

        Self::require_asset_accepted(&env, &asset_contract);

        env.storage()
            .instance()
            .set(&SaiKey::CertPrice(asset_contract.clone()), &new_price);

        env.events().publish(
            (Symbol::new(&env, "sai_price_updated"),),
            (admin, asset_contract, new_price),
        );
    }

    // -----------------------------------------------------------------------
    // Core: payment_gateway
    // -----------------------------------------------------------------------

    fn require_asset_accepted(env: &Env, asset_contract: &Address) {
        let assets: Map<Address, bool> = env
            .storage()
            .instance()
            .get(&SaiKey::AcceptedAssets)
            .unwrap_or_else(|| panic_with_error!(env, SaiError::NotInitialized));

        if !assets.contains_key(asset_contract.clone()) {
            panic_with_error!(env, SaiError::AssetNotAccepted);
        }
    }

    /// Accept a payment from `payer` for a premium certificate using the
    /// specified `asset_contract` (SAC).
    ///
    /// Flow:
    /// 1. Require payer authorisation.
    /// 2. Verify the asset is accepted and has a price configured.
    /// 3. Check payer's balance is sufficient.
    /// 4. Execute the transfer via the SAC token interface.
    /// 5. Verify transfer completion (treasury balance increased).
    /// 6. Record the payment.
    pub fn payment_gateway(env: Env, payer: Address, asset_contract: Address) {
        payer.require_auth();
        Self::require_initialized(&env);
        Self::require_asset_accepted(&env, &asset_contract);

        // Lookup price.
        let cert_price: i128 = env
            .storage()
            .instance()
            .get(&SaiKey::CertPrice(asset_contract.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, SaiError::NoPriceSet));

        let treasury: Address = env.storage().instance().get(&SaiKey::Treasury).unwrap();

        // Build token client for the SAC.
        let token_client = token::Client::new(&env, &asset_contract);

        // Pre-flight: check payer has enough balance.
        let payer_balance = token_client.balance(&payer);
        if payer_balance < cert_price {
            panic_with_error!(&env, SaiError::InsufficientBalance);
        }

        // Snapshot treasury balance before the transfer.
        let balance_before = token_client.balance(&treasury);

        // Execute transfer through the Soroban token interface (SAC).
        token_client.transfer(&payer, &treasury, &cert_price);

        // Verify transfer completion: treasury balance must have increased.
        let balance_after = token_client.balance(&treasury);
        if balance_after < balance_before + cert_price {
            panic_with_error!(&env, SaiError::TransferFailed);
        }

        // Record the payment.
        env.storage()
            .instance()
            .set(&SaiKey::PremiumPaid(payer.clone()), &true);

        // Update total collected for this asset.
        let total: i128 = env
            .storage()
            .instance()
            .get(&SaiKey::TotalCollected(asset_contract.clone()))
            .unwrap_or(0);
        env.storage().instance().set(
            &SaiKey::TotalCollected(asset_contract.clone()),
            &(total + cert_price),
        );

        // Emit payment event.
        env.events().publish(
            (Symbol::new(&env, "sai_payment"),),
            (payer, asset_contract, cert_price),
        );
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Returns `true` if `payer` has completed a premium payment.
    pub fn has_paid(env: Env, payer: Address) -> bool {
        env.storage()
            .instance()
            .get(&SaiKey::PremiumPaid(payer))
            .unwrap_or(false)
    }

    /// Get the `payer`'s current balance of the given SAC asset.
    pub fn get_balance(env: Env, asset_contract: Address, account: Address) -> i128 {
        Self::require_initialized(&env);
        let token_client = token::Client::new(&env, &asset_contract);
        token_client.balance(&account)
    }

    /// Returns the certificate price for the given asset.
    pub fn get_cert_price(env: Env, asset_contract: Address) -> i128 {
        env.storage()
            .instance()
            .get(&SaiKey::CertPrice(asset_contract))
            .unwrap_or_else(|| panic_with_error!(&env, SaiError::NoPriceSet))
    }

    /// Returns the total amount collected for a given asset.
    pub fn get_total_collected(env: Env, asset_contract: Address) -> i128 {
        env.storage()
            .instance()
            .get(&SaiKey::TotalCollected(asset_contract))
            .unwrap_or(0)
    }

    /// Returns the treasury address.
    pub fn get_treasury(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&SaiKey::Treasury)
            .unwrap_or_else(|| panic_with_error!(&env, SaiError::NotInitialized))
    }

    /// Check whether a specific asset is accepted.
    pub fn is_asset_accepted(env: Env, asset_contract: Address) -> bool {
        let assets: Map<Address, bool> = env
            .storage()
            .instance()
            .get(&SaiKey::AcceptedAssets)
            .unwrap_or_else(|| Map::new(&env));
        assets.contains_key(asset_contract)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env,
    };

    // -----------------------------------------------------------------------
    // Test helpers
    // -----------------------------------------------------------------------

    /// Deploy a mock SAC and return (sac_address, sac_admin_client).
    fn deploy_sac(env: &Env) -> (Address, StellarAssetClient<'static>) {
        let asset_admin = Address::generate(env);
        let asset_id = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let asset_address = asset_id.address();
        let sac_admin = StellarAssetClient::new(env, &asset_address);
        (asset_address, sac_admin)
    }

    struct Setup {
        env: Env,
        asset_address: Address,
        treasury: Address,
        admin: Address,
        payer: Address,
        client: SaiWrapperContractClient<'static>,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let (asset_address, sac_admin) = deploy_sac(&env);
        let treasury = Address::generate(&env);
        let admin = Address::generate(&env);
        let payer = Address::generate(&env);

        // Mint tokens to payer.
        sac_admin.mint(&payer, &10_000);

        // Deploy SAI wrapper.
        let contract_id = env.register(SaiWrapperContract, ());
        let client = SaiWrapperContractClient::new(&env, &contract_id);
        client.init(&admin, &treasury, &asset_address, &500);

        Setup {
            env,
            asset_address,
            treasury,
            admin,
            payer,
            client,
        }
    }

    // -----------------------------------------------------------------------
    // payment_gateway
    // -----------------------------------------------------------------------

    #[test]
    fn payment_transfers_tokens_and_records_paid() {
        let s = setup();
        let token = TokenClient::new(&s.env, &s.asset_address);

        // Before payment.
        assert!(!s.client.has_paid(&s.payer));
        assert_eq!(token.balance(&s.treasury), 0);
        assert_eq!(token.balance(&s.payer), 10_000);

        // Pay.
        s.client.payment_gateway(&s.payer, &s.asset_address);

        // After payment.
        assert!(s.client.has_paid(&s.payer));
        assert_eq!(token.balance(&s.treasury), 500);
        assert_eq!(token.balance(&s.payer), 9_500);
    }

    #[test]
    fn total_collected_tracks_payments() {
        let s = setup();
        assert_eq!(s.client.get_total_collected(&s.asset_address), 0);

        s.client.payment_gateway(&s.payer, &s.asset_address);
        assert_eq!(s.client.get_total_collected(&s.asset_address), 500);
    }

    #[test]
    fn has_paid_returns_false_for_unknown_address() {
        let s = setup();
        let stranger = Address::generate(&s.env);
        assert!(!s.client.has_paid(&stranger));
    }

    // -----------------------------------------------------------------------
    // Insufficient balance
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn payment_rejects_insufficient_balance() {
        let s = setup();
        let broke_user = Address::generate(&s.env);
        // broke_user has 0 tokens – should fail.
        s.client.payment_gateway(&broke_user, &s.asset_address);
    }

    // -----------------------------------------------------------------------
    // Invalid / unaccepted asset
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn payment_rejects_unaccepted_asset() {
        let s = setup();
        let (rogue_asset, _) = deploy_sac(&s.env);
        // rogue_asset was never added – should fail.
        s.client.payment_gateway(&s.payer, &rogue_asset);
    }

    // -----------------------------------------------------------------------
    // Multi-asset support
    // -----------------------------------------------------------------------

    #[test]
    fn multi_asset_payments() {
        let s = setup();

        // Deploy a second SAC (USDC-like).
        let (usdc_address, usdc_admin) = deploy_sac(&s.env);
        usdc_admin.mint(&s.payer, &5_000);

        // Add USDC as accepted asset with price = 200.
        s.client.add_accepted_asset(&s.admin, &usdc_address, &200);

        assert!(s.client.is_asset_accepted(&usdc_address));
        assert_eq!(s.client.get_cert_price(&usdc_address), 200);

        // Pay with USDC.
        let usdc_token = TokenClient::new(&s.env, &usdc_address);
        s.client.payment_gateway(&s.payer, &usdc_address);

        assert!(s.client.has_paid(&s.payer));
        assert_eq!(usdc_token.balance(&s.treasury), 200);
        assert_eq!(s.client.get_total_collected(&usdc_address), 200);
    }

    // -----------------------------------------------------------------------
    // Admin functions
    // -----------------------------------------------------------------------

    #[test]
    fn admin_can_update_cert_price() {
        let s = setup();
        assert_eq!(s.client.get_cert_price(&s.asset_address), 500);

        s.client.set_cert_price(&s.admin, &s.asset_address, &750);
        assert_eq!(s.client.get_cert_price(&s.asset_address), 750);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn non_admin_cannot_update_price() {
        let s = setup();
        let impostor = Address::generate(&s.env);
        s.client.set_cert_price(&impostor, &s.asset_address, &999);
    }

    #[test]
    fn admin_can_remove_asset() {
        let s = setup();
        assert!(s.client.is_asset_accepted(&s.asset_address));

        s.client.remove_accepted_asset(&s.admin, &s.asset_address);
        assert!(!s.client.is_asset_accepted(&s.asset_address));
    }

    // -----------------------------------------------------------------------
    // Double-init
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn double_init_panics() {
        let s = setup();
        s.client.init(&s.admin, &s.treasury, &s.asset_address, &100);
    }

    // -----------------------------------------------------------------------
    // Query helpers
    // -----------------------------------------------------------------------

    #[test]
    fn get_balance_returns_correct_amount() {
        let s = setup();
        assert_eq!(s.client.get_balance(&s.asset_address, &s.payer), 10_000);
    }

    #[test]
    fn get_treasury_returns_configured_address() {
        let s = setup();
        assert_eq!(s.client.get_treasury(), s.treasury);
    }

    // -----------------------------------------------------------------------
    // Invalid amount
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn init_rejects_zero_price() {
        let env = Env::default();
        env.mock_all_auths();
        let (asset_address, _) = deploy_sac(&env);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let contract_id = env.register(SaiWrapperContract, ());
        let client = SaiWrapperContractClient::new(&env, &contract_id);
        client.init(&admin, &treasury, &asset_address, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn set_cert_price_rejects_negative() {
        let s = setup();
        s.client.set_cert_price(&s.admin, &s.asset_address, &-10);
    }
}
