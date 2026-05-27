/// #160 – Stellar Asset Interface (SAI) Wrapper / Payment Gateway
///
/// Wraps a native Stellar Asset Contract (SAC) so the lab can accept XLM
/// payments for premium certificates.  Uses the Soroban token interface to
/// interact with the SAC and verifies transfer completion before proceeding.
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum GatewayKey {
    /// Address of the native SAC (XLM or USDC).
    AssetContract,
    /// Address that receives payments (treasury / admin).
    Treasury,
    /// Price in stroops (or token base units) for one premium certificate.
    CertPrice,
    /// Whether `payer` has a valid premium payment on record.
    PremiumPaid(Address),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum GatewayError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    TransferFailed = 3,
    AlreadyPaid = 4,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PaymentGatewayContract;

#[contractimpl]
impl PaymentGatewayContract {
    /// One-time initialisation: set the SAC address, treasury, and cert price.
    pub fn init(env: Env, asset_contract: Address, treasury: Address, cert_price: i128) {
        if env.storage().instance().has(&GatewayKey::AssetContract) {
            panic_with_error!(&env, GatewayError::AlreadyInitialized);
        }

        env.storage()
            .instance()
            .set(&GatewayKey::AssetContract, &asset_contract);
        env.storage()
            .instance()
            .set(&GatewayKey::Treasury, &treasury);
        env.storage()
            .instance()
            .set(&GatewayKey::CertPrice, &cert_price);
    }

    /// Accept a payment from `payer` for a premium certificate.
    ///
    /// Steps:
    /// 1. Require payer authorisation.
    /// 2. Transfer `cert_price` tokens from payer → treasury via the SAC.
    /// 3. Verify the treasury balance increased (transfer completion check).
    /// 4. Record the payment so downstream logic can gate certificate issuance.
    pub fn payment_gateway(env: Env, payer: Address) {
        payer.require_auth();

        let asset_contract: Address = env
            .storage()
            .instance()
            .get(&GatewayKey::AssetContract)
            .unwrap_or_else(|| panic_with_error!(&env, GatewayError::NotInitialized));

        let treasury: Address = env.storage().instance().get(&GatewayKey::Treasury).unwrap();

        let cert_price: i128 = env
            .storage()
            .instance()
            .get(&GatewayKey::CertPrice)
            .unwrap();

        // Snapshot treasury balance before transfer.
        let token_client = token::Client::new(&env, &asset_contract);
        let balance_before = token_client.balance(&treasury);

        // Execute the transfer via the SAC token interface.
        token_client.transfer(&payer, &treasury, &cert_price);

        // Verify transfer completion: treasury balance must have increased.
        let balance_after = token_client.balance(&treasury);
        if balance_after <= balance_before {
            panic_with_error!(&env, GatewayError::TransferFailed);
        }

        // Record payment.
        env.storage()
            .instance()
            .set(&GatewayKey::PremiumPaid(payer), &true);
    }

    /// Returns true if `payer` has completed a premium payment.
    pub fn has_paid(env: Env, payer: Address) -> bool {
        env.storage()
            .instance()
            .get(&GatewayKey::PremiumPaid(payer))
            .unwrap_or(false)
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

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        PaymentGatewayContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy a mock SAC (Stellar Asset Contract).
        let asset_admin = Address::generate(&env);
        let asset_id = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let asset_address = asset_id.address();

        let treasury = Address::generate(&env);
        let payer = Address::generate(&env);

        // Mint tokens to payer.
        let sac_admin = StellarAssetClient::new(&env, &asset_address);
        sac_admin.mint(&payer, &1_000);

        // Deploy gateway.
        let gw_id = env.register(PaymentGatewayContract, ());
        let client = PaymentGatewayContractClient::new(&env, &gw_id);
        client.init(&asset_address, &treasury, &500);

        (env, asset_address, treasury, payer, client)
    }

    #[test]
    fn payment_transfers_tokens_and_records_paid() {
        let (_env, _asset, treasury, payer, client) = setup();

        client.payment_gateway(&payer);

        assert!(client.has_paid(&payer));

        // Treasury should hold 500 tokens.
        let env = _env;
        let token = TokenClient::new(&env, &_asset);
        assert_eq!(token.balance(&treasury), 500);
    }

    #[test]
    fn has_paid_returns_false_before_payment() {
        let (env, _asset, _treasury, _payer, client) = setup();
        let stranger = Address::generate(&env);
        assert!(!client.has_paid(&stranger));
    }

    #[test]
    #[should_panic]
    fn double_init_panics() {
        let (_env, asset, treasury, _payer, client) = setup();
        client.init(&asset, &treasury, &100);
    }
}
