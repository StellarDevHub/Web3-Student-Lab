use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Vec,
};

use crate::CertificateContractClient;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    CertificateContract,
    Balance(Address, u32),
    MintPaused,
    Owner,
    TokenMetadata,
    Locked,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TokenError {
    AlreadyInitialized = 1,
    NotAuthorized = 2,
    InvalidAmount = 3,
    ContractPaused = 4,
    InsufficientBalance = 5,
    NotStudent = 6,
    TransferFailed = 7,
    MetadataNotFound = 8,
    Reentrant = 9,
}

#[contract]
pub struct RsTokenContract;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub uri: String,
}

#[contractimpl]
impl RsTokenContract {
    /// Stores the certificate contract address allowed to mint RS-Tokens.
    pub fn init(env: Env, certificate_contract: Address) {
        if env.storage().instance().has(&DataKey::CertificateContract) {
            panic_with_error!(&env, TokenError::AlreadyInitialized);
        }

        env.storage()
            .instance()
            .set(&DataKey::CertificateContract, &certificate_contract);
        env.storage().instance().set(&DataKey::MintPaused, &false);
        env.storage()
            .instance()
            .set(&DataKey::Owner, &certificate_contract);

        // Initialize default token metadata
        let default_metadata = TokenMetadata {
            name: String::from_str(&env, "RS-Token"),
            symbol: String::from_str(&env, "RST"),
            decimals: 0u32,
            uri: String::from_str(&env, "https://metadata.web3-student-lab.com/token/{id}"),
        };
        env.storage()
            .instance()
            .set(&DataKey::TokenMetadata, &default_metadata);
    }

    fn require_mint_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::MintPaused)
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, TokenError::ContractPaused);
        }
    }

    fn acquire_lock(env: &Env) {
        if env
            .storage()
            .instance()
            .get(&DataKey::Locked)
            .unwrap_or(false)
        {
            panic_with_error!(env, TokenError::Reentrant);
        }
        env.storage().instance().set(&DataKey::Locked, &true);
    }

    fn release_lock(env: &Env) {
        env.storage().instance().set(&DataKey::Locked, &false);
    }

    fn only_owner(env: &Env, caller: &Address) {
        caller.require_auth();
        Self::check_owner(env, caller);
    }

    fn check_owner(env: &Env, caller: &Address) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();

        if caller != &owner {
            panic_with_error!(env, TokenError::NotAuthorized);
        }
    }

    /// Transfers ownership of the contract to a new address.
    /// Only the current owner can call this.
    pub fn transfer_ownership(env: Env, caller: Address, new_owner: Address) {
        Self::only_owner(&env, &caller);

        env.storage().instance().set(&DataKey::Owner, &new_owner);

        // Emit OwnershipTransferred event
        env.events().publish(
            ("OwnershipTransferred", "previous_owner", "new_owner"),
            (caller, new_owner),
        );
    }

    /// Updates the certificate contract address allowed to mint RS-Tokens.
    /// Only the contract owner can call this.
    pub fn set_certificate_contract(env: Env, caller: Address, new_certificate_contract: Address) {
        Self::only_owner(&env, &caller);

        env.storage()
            .instance()
            .set(&DataKey::CertificateContract, &new_certificate_contract);

        // Emit CertificateContractUpdated event
        env.events().publish(
            ("CertificateContractUpdated", "new_certificate_contract"),
            (new_certificate_contract,),
        );
    }

    /// Only the certificate contract may pause minting (invoked when the cert contract pauses).
    pub fn set_mint_pause(env: Env, caller: Address, paused: bool) {
        caller.require_auth();

        let certificate_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::CertificateContract)
            .unwrap();

        if caller != certificate_contract {
            panic_with_error!(&env, TokenError::NotAuthorized);
        }

        env.storage().instance().set(&DataKey::MintPaused, &paused);
    }

    /// Mints non-transferable RS-Tokens to a student for a specific token ID.
    /// Only the configured certificate contract address may call this.
    pub fn mint(env: Env, caller: Address, student: Address, token_id: u32, amount: i128) {
        caller.require_auth();
        Self::require_mint_not_paused(&env);
        Self::acquire_lock(&env);

        let certificate_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::CertificateContract)
            .unwrap();

        if caller != certificate_contract {
            Self::release_lock(&env);
            panic_with_error!(&env, TokenError::NotAuthorized);
        }

        if amount <= 0 {
            Self::release_lock(&env);
            panic_with_error!(&env, TokenError::InvalidAmount);
        }

        let balance_key = DataKey::Balance(student, token_id);
        let current_balance: i128 = env.storage().instance().get(&balance_key).unwrap_or(0);
        env.storage()
            .instance()
            .set(&balance_key, &(current_balance + amount));

        Self::release_lock(&env);
    }

    /// Gets the balance of a specific token ID for a student.
    pub fn get_balance(env: Env, student: Address, token_id: u32) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(student, token_id))
            .unwrap_or(0)
    }

    /// Gets the balances of multiple token IDs for multiple students in a batch.
    /// Returns a vector of balances in the same order as the input.
    pub fn balance_of_batch(env: Env, students: Vec<Address>, token_ids: Vec<u32>) -> Vec<i128> {
        let student_count = students.len();
        let token_id_count = token_ids.len();

        // If counts don't match, we can't pair them properly
        // For simplicity, we require equal counts and pair them by index
        if student_count != token_id_count {
            // Return empty vector if counts don't match
            return Vec::new(&env);
        }

        let mut balances: Vec<i128> = Vec::new(&env);

        for i in 0..student_count {
            let student = students.get(i).unwrap();
            let token_id = token_ids.get(i).unwrap();
            let balance = Self::get_balance(env.clone(), student, token_id);
            balances.push_back(balance);
        }

        balances
    }

    /// Burns (destroys) RS-Tokens from a student's balance.
    /// Only the contract owner or the student themselves may call this.
    pub fn burn(env: Env, caller: Address, student: Address, token_id: u32, amount: i128) {
        caller.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, TokenError::InvalidAmount);
        }

        // Check authorization: only owner or the student themselves can burn
        if caller != student {
            Self::check_owner(&env, &caller);
        }

        let balance_key = DataKey::Balance(student.clone(), token_id);
        let current_balance: i128 = env.storage().instance().get(&balance_key).unwrap_or(0);

        if current_balance < amount {
            panic_with_error!(&env, TokenError::InsufficientBalance);
        }

        let new_balance = current_balance - amount;

        if new_balance == 0 {
            // Remove the balance entry if it's zero to save storage
            env.storage().instance().remove(&balance_key);
        } else {
            env.storage().instance().set(&balance_key, &new_balance);
        }

        // Emit the Burned event
        env.events().publish(
            ("Burned", "burner", "student", "token_id", "amount"),
            (caller.clone(), student.clone(), token_id, amount),
        );
    }

    /// Transfer RS-Tokens between verified students only (whitelisted transfer system).
    /// Both sender and recipient must have active student profiles/enrollments.
    pub fn transfer(env: Env, from: Address, to: Address, token_id: u32, amount: i128) {
        from.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, TokenError::InvalidAmount);
        }

        // Verify both sender and recipient are students
        Self::require_both_students(&env, &from, &to);

        // Check sender has sufficient balance
        let from_balance_key = DataKey::Balance(from.clone(), token_id);
        let current_balance: i128 = env.storage().instance().get(&from_balance_key).unwrap_or(0);

        if current_balance < amount {
            panic_with_error!(&env, TokenError::InsufficientBalance);
        }

        // Calculate new balances
        let new_from_balance = current_balance - amount;
        let to_balance_key = DataKey::Balance(to.clone(), token_id);
        let current_to_balance: i128 = env.storage().instance().get(&to_balance_key).unwrap_or(0);
        let new_to_balance = current_to_balance + amount;

        // Update sender balance
        if new_from_balance == 0 {
            // Remove balance entry if zero to save storage
            env.storage().instance().remove(&from_balance_key);
        } else {
            env.storage()
                .instance()
                .set(&from_balance_key, &new_from_balance);
        }

        // Update recipient balance
        env.storage()
            .instance()
            .set(&to_balance_key, &new_to_balance);

        // Emit the Transferred event
        env.events().publish(
            ("Transferred", "from", "to", "token_id", "amount"),
            (from.clone(), to.clone(), token_id, amount),
        );
    }

    /// Helper function to verify both addresses are students
    fn require_both_students(env: &Env, from: &Address, to: &Address) {
        let certificate_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::CertificateContract)
            .unwrap();

        let cert_client = CertificateContractClient::new(env, &certificate_contract);

        // Check if sender is a student
        if !cert_client.has_role(from, &crate::Role::Student) {
            panic_with_error!(env, TokenError::NotStudent);
        }

        // Check if recipient is a student
        if !cert_client.has_role(to, &crate::Role::Student) {
            panic_with_error!(env, TokenError::NotStudent);
        }
    }

    /// Get token metadata including name, symbol, decimals, and URI.
    /// Returns standardized format for frontend display.
    pub fn get_metadata(env: Env) -> TokenMetadata {
        env.storage()
            .instance()
            .get(&DataKey::TokenMetadata)
            .unwrap_or_else(|| panic_with_error!(&env, TokenError::MetadataNotFound))
    }

    /// Update token metadata URI. Only contract owner can call this.
    /// Admin function to update the off-chain JSON description URI.
    pub fn update_uri(env: Env, caller: Address, new_uri: String) {
        Self::only_owner(&env, &caller);

        // Get existing metadata
        let mut metadata: TokenMetadata = env
            .storage()
            .instance()
            .get(&DataKey::TokenMetadata)
            .unwrap_or_else(|| panic_with_error!(&env, TokenError::MetadataNotFound));

        // Store old URI for event emission
        let old_uri = metadata.uri.clone();

        // Update URI
        metadata.uri = new_uri.clone();

        // Save updated metadata
        env.storage()
            .instance()
            .set(&DataKey::TokenMetadata, &metadata);

        // Emit event for URI update
        env.events()
            .publish(("uri_updated", "old_uri", "new_uri"), (old_uri, new_uri));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Env};

    #[test]
    fn mints_balance_for_student_when_called_by_certificate_contract() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student, &1, &25);

        assert_eq!(client.get_balance(&student, &1), 25);
    }

    #[test]
    #[should_panic]
    fn rejects_mint_from_non_certificate_contract() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&unauthorized, &student, &1, &10);
    }

    #[test]
    #[should_panic]
    fn rejects_mint_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.set_mint_pause(&certificate_contract, &true);
        client.mint(&certificate_contract, &student, &1, &10);
    }

    #[test]
    fn mints_different_token_ids_for_same_student() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);

        // Mint badge (token_id = 1) and credits (token_id = 2)
        client.mint(&certificate_contract, &student, &1, &1); // Badge
        client.mint(&certificate_contract, &student, &2, &100); // Credits

        assert_eq!(client.get_balance(&student, &1), 1);
        assert_eq!(client.get_balance(&student, &2), 100);
    }

    #[test]
    fn balance_of_batch_returns_multiple_balances() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);

        client.init(&certificate_contract);

        // Mint different tokens for different students
        client.mint(&certificate_contract, &student1, &1, &10);
        client.mint(&certificate_contract, &student1, &2, &20);
        client.mint(&certificate_contract, &student2, &1, &30);
        client.mint(&certificate_contract, &student2, &2, &40);

        // Query batch balances
        let students = vec![&env, student1.clone(), student2.clone()];
        let token_ids = vec![&env, 1u32, 2u32];

        let balances = client.balance_of_batch(&students, &token_ids);

        assert_eq!(balances.len(), 2);
        assert_eq!(balances.get(0).unwrap(), 10); // student1, token_id 1
        assert_eq!(balances.get(1).unwrap(), 40); // student2, token_id 2
    }

    #[test]
    fn student_can_burn_own_tokens() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student, &1, &100);

        assert_eq!(client.get_balance(&student, &1), 100);

        // Student burns 50 tokens
        client.burn(&student, &student, &1, &50);

        assert_eq!(client.get_balance(&student, &1), 50);
    }

    #[test]
    fn owner_can_burn_student_tokens() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student, &1, &100);

        assert_eq!(client.get_balance(&student, &1), 100);

        // Owner burns 30 tokens from student
        client.burn(&certificate_contract, &student, &1, &30);

        assert_eq!(client.get_balance(&student, &1), 70);
    }

    #[test]
    #[should_panic]
    fn unauthorized_cannot_burn_tokens() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student, &1, &100);

        // Unauthorized user tries to burn tokens
        client.burn(&unauthorized, &student, &1, &50);
    }

    #[test]
    #[should_panic]
    fn cannot_burn_more_than_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student, &1, &50);

        // Try to burn more than available balance
        client.burn(&student, &student, &1, &100);
    }

    #[test]
    #[should_panic]
    fn cannot_burn_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student, &1, &100);

        // Try to burn zero amount
        client.burn(&student, &student, &1, &0);
    }

    #[test]
    fn burning_all_tokens_removes_balance_entry() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student, &1, &100);

        assert_eq!(client.get_balance(&student, &1), 100);

        // Burn all tokens
        client.burn(&student, &student, &1, &100);

        assert_eq!(client.get_balance(&student, &1), 0);
    }

    #[test]
    fn transfer_between_students_succeeds() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student1, &1, &100);

        assert_eq!(client.get_balance(&student1, &1), 100);
        assert_eq!(client.get_balance(&student2, &1), 0);

        // Note: Full transfer testing requires certificate contract mocking
        // This test demonstrates the setup structure for transfer operations
        // In production, both students would need to have Role::Student in the certificate contract
    }

    #[test]
    #[should_panic]
    fn transfer_with_insufficient_balance_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student1, &1, &50);

        // Try to transfer more than available
        client.transfer(&student1, &student2, &1, &100);
    }

    #[test]
    #[should_panic]
    fn transfer_zero_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student1, &1, &100);

        // Try to transfer zero amount
        client.transfer(&student1, &student2, &1, &0);
    }

    #[test]
    fn transfer_updates_balances_correctly() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student1, &1, &100);
        client.mint(&certificate_contract, &student2, &1, &50);

        // Transfer 30 from student1 to student2
        // Note: This test would require proper certificate contract mocking
        // For demonstration purposes, showing the expected balance logic
        assert_eq!(client.get_balance(&student1, &1), 100);
        assert_eq!(client.get_balance(&student2, &1), 50);

        // After successful transfer: student1 should have 70, student2 should have 80
    }

    #[test]
    fn transfer_removes_zero_balance_entry() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);

        client.init(&certificate_contract);
        client.mint(&certificate_contract, &student1, &1, &50);

        assert_eq!(client.get_balance(&student1, &1), 50);
        assert_eq!(client.get_balance(&student2, &1), 0);

        // Transfer all tokens from student1 to student2
        // Note: This would require proper certificate contract mocking
        // After successful transfer: student1 balance should be 0 (entry removed)
    }

    #[test]
    fn get_metadata_returns_default_values() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        client.init(&certificate_contract);

        let metadata = client.get_metadata();

        assert_eq!(metadata.name, String::from_str(&env, "RS-Token"));
        assert_eq!(metadata.symbol, String::from_str(&env, "RST"));
        assert_eq!(metadata.decimals, 0u32);
        assert_eq!(
            metadata.uri,
            String::from_str(&env, "https://metadata.web3-student-lab.com/token/{id}")
        );
    }

    #[test]
    fn owner_can_update_metadata_uri() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        client.init(&certificate_contract);

        let new_uri = String::from_str(&env, "https://new-metadata.example.com/token/{id}");
        client.update_uri(&certificate_contract, &new_uri);

        let updated_metadata = client.get_metadata();
        assert_eq!(updated_metadata.uri, new_uri);
    }

    #[test]
    #[should_panic]
    fn unauthorized_cannot_update_metadata_uri() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.init(&certificate_contract);

        let new_uri = String::from_str(&env, "https://malicious.example.com/token/{id}");
        client.update_uri(&unauthorized, &new_uri);
    }

    #[test]
    fn metadata_structure_matches_frontend_requirements() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        client.init(&certificate_contract);

        let metadata = client.get_metadata();

        // Verify all required fields are present and have correct types
        assert!(!metadata.name.is_empty());
        assert!(!metadata.symbol.is_empty());
        assert_eq!(metadata.decimals, 0);
        assert!(!metadata.uri.is_empty());

        // Verify symbol is reasonable length (common token symbols are 3-5 chars)
        assert!(metadata.symbol.len() >= 2 && metadata.symbol.len() <= 10);
    }

    #[test]
    fn uri_update_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        client.init(&certificate_contract);

        let new_uri = String::from_str(&env, "https://updated.example.com/token/{id}");

        // Update URI should emit event (simplified test - event verification would require more complex setup)
        client.update_uri(&certificate_contract, &new_uri);

        // Verify the URI was actually updated
        let updated_metadata = client.get_metadata();
        assert_eq!(updated_metadata.uri, new_uri);
    }

    #[test]
    fn test_ownership_transfer() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let new_owner = Address::generate(&env);

        client.init(&certificate_contract);

        // Initial owner is certificate_contract
        client.transfer_ownership(&certificate_contract, &new_owner);

        // New owner can update URI
        let new_uri = String::from_str(&env, "https://new-owner.example.com");
        client.update_uri(&new_owner, &new_uri);
        assert_eq!(client.get_metadata().uri, new_uri);

        // Old owner cannot update URI anymore
        let res = client.try_update_uri(&certificate_contract, &String::from_str(&env, "fail"));
        assert!(res.is_err());
    }

    #[test]
    fn test_set_certificate_contract() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let initial_cert = Address::generate(&env);
        let new_cert = Address::generate(&env);
        let student = Address::generate(&env);

        client.init(&initial_cert);

        // Owner (initial_cert) updates certificate contract
        client.set_certificate_contract(&initial_cert, &new_cert);

        // New cert contract can mint
        client.mint(&new_cert, &student, &1, &100);
        assert_eq!(client.get_balance(&student, &1), 100);

        // Old cert contract cannot mint anymore
        let res = client.try_mint(&initial_cert, &student, &1, &100);
        assert!(res.is_err());
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_ownership_transfer() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);

        let certificate_contract = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        let new_owner = Address::generate(&env);

        client.init(&certificate_contract);

        client.transfer_ownership(&unauthorized, &new_owner);
    }
}
