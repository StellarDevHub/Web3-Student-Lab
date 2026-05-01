//! Test module for carbon credit platform and verification system

#[cfg(test)]
mod tests {
    use soroban_sdk::{Address, Env, Symbol};
    use crate::carbon_credit_platform::{
        CarbonCreditPlatform, CarbonCredit, CarbonProject, ProjectStatus, VerificationStatus
    };
    use crate::verification_system::{
        VerificationSystem, VerifierProfile, VerifierStatus, VerificationType
    };

    #[test]
    fn test_carbon_credit_platform_init() {
        let env = Env::default();
        let admin = Address::generate(&env);
        
        CarbonCreditPlatform::init(env.clone(), admin);
        
        // Verify configuration is set
        let config = CarbonCreditPlatform::get_config(&env);
        assert_eq!(config.admin, admin);
    }

    #[test]
    fn test_project_registration() {
        let env = Env::default();
        let admin = Address::generate(&env);
        
        CarbonCreditPlatform::init(env.clone(), admin.clone());
        
        let project_id = CarbonCreditPlatform::register_project(
            env.clone(),
            admin.clone(),
            String::from_str_slice(&env, "Test Project"),
            Symbol::new(&env, "forestry"),
            Symbol::new(&env, "US"),
            1000,
            Symbol::new(&env, "AMS001"),
            String::from_str_slice(&env, "https://metadata.example.com")
        );
        
        let project = CarbonCreditPlatform::get_project(env.clone(), project_id);
        assert_eq!(project.name, String::from_str_slice(&env, "Test Project"));
        assert_eq!(project.developer, admin);
        assert_eq!(project.status, ProjectStatus::Registered);
    }

    #[test]
    fn test_verification_system_init() {
        let env = Env::default();
        let admin = Address::generate(&env);
        
        VerificationSystem::init(env.clone(), admin);
        
        // Verify configuration is set
        let config = VerificationSystem::get_config(&env);
        assert_eq!(config.admin, admin);
    }

    #[test]
    fn test_verifier_registration() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);
        
        VerificationSystem::init(env.clone(), admin.clone());
        
        VerificationSystem::register_verifier(
            env.clone(),
            verifier.clone(),
            String::from_str_slice(&env, "Test Verification Org"),
            String::from_str_slice(&env, "ACC-123"),
            Symbol::new(&env, "Verra"),
            Vec::new(&env),
            String::from_str_slice(&env, "https://metadata.example.com")
        );
        
        let profile = VerificationSystem::get_verifier(env.clone(), verifier);
        assert_eq!(profile.organization, String::from_str_slice(&env, "Test Verification Org"));
        assert_eq!(profile.status, VerifierStatus::Pending);
    }

    #[test]
    fn test_verification_request_creation() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let requester = Address::generate(&env);
        
        VerificationSystem::init(env.clone(), admin);
        
        let request_id = VerificationSystem::create_verification_request(
            env.clone(),
            requester.clone(),
            Symbol::new(&env, "PROJ_1"),
            VerificationType::InitialVerification,
            String::from_str_slice(&env, "Initial verification request")
        );
        
        let request = VerificationSystem::get_verification_request(env.clone(), request_id);
        assert_eq!(request.requester, requester);
        assert_eq!(request.project_id, Symbol::new(&env, "PROJ_1"));
        assert_eq!(request.verification_type, VerificationType::InitialVerification);
    }

    #[test]
    fn test_credit_minting() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let developer = Address::generate(&env);
        
        CarbonCreditPlatform::init(env.clone(), admin.clone());
        
        // Register and approve a project
        let project_id = CarbonCreditPlatform::register_project(
            env.clone(),
            developer.clone(),
            String::from_str_slice(&env, "Test Project"),
            Symbol::new(&env, "forestry"),
            Symbol::new(&env, "US"),
            1000,
            Symbol::new(&env, "AMS001"),
            String::from_str_slice(&env, "https://metadata.example.com")
        );
        
        // Mint credits (note: in real implementation, project would need to be verified first)
        let token_ids = CarbonCreditPlatform::mint_credits(
            env.clone(),
            developer.clone(),
            project_id.clone(),
            5,
            2023,
            Symbol::new(&env, "Verra"),
            String::from_str_slice(&env, "https://metadata.example.com/credit")
        );
        
        assert_eq!(token_ids.len(), 5);
        
        // Verify first credit
        let credit = CarbonCreditPlatform::get_credit(env.clone(), token_ids.get(0).unwrap());
        assert_eq!(credit.project_id, project_id);
        assert_eq!(credit.vintage, 2023);
        assert_eq!(credit.amount, 1);
        assert_eq!(credit.owner, developer);
        assert_eq!(credit.verification_status, VerificationStatus::Verified);
        assert!(!credit.retired);
    }

    #[test]
    fn test_marketplace_order_creation() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let seller = Address::generate(&env);
        
        CarbonCreditPlatform::init(env.clone(), admin.clone());
        
        // Register project and mint credit
        let project_id = CarbonCreditPlatform::register_project(
            env.clone(),
            seller.clone(),
            String::from_str_slice(&env, "Test Project"),
            Symbol::new(&env, "forestry"),
            Symbol::new(&env, "US"),
            1000,
            Symbol::new(&env, "AMS001"),
            String::from_str_slice(&env, "https://metadata.example.com")
        );
        
        let token_ids = CarbonCreditPlatform::mint_credits(
            env.clone(),
            seller.clone(),
            project_id,
            1,
            2023,
            Symbol::new(&env, "Verra"),
            String::from_str_slice(&env, "https://metadata.example.com/credit")
        );
        
        let token_id = token_ids.get(0).unwrap();
        
        // Create sell order
        let order_id = CarbonCreditPlatform::create_sell_order(
            env.clone(),
            seller.clone(),
            *token_id,
            1550, // $15.50 in cents
            86400  // 1 day duration
        );
        
        let order = CarbonCreditPlatform::get_order(env.clone(), order_id);
        assert_eq!(order.seller, seller);
        assert_eq!(order.token_id, *token_id);
        assert_eq!(order.price, 1550);
        assert!(order.active);
    }

    #[test]
    fn test_credit_retirement() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        
        CarbonCreditPlatform::init(env.clone(), admin.clone());
        
        // Register project and mint credits
        let project_id = CarbonCreditPlatform::register_project(
            env.clone(),
            owner.clone(),
            String::from_str_slice(&env, "Test Project"),
            Symbol::new(&env, "forestry"),
            Symbol::new(&env, "US"),
            1000,
            Symbol::new(&env, "AMS001"),
            String::from_str_slice(&env, "https://metadata.example.com")
        );
        
        let token_ids = CarbonCreditPlatform::mint_credits(
            env.clone(),
            owner.clone(),
            project_id,
            3,
            2023,
            Symbol::new(&env, "Verra"),
            String::from_str_slice(&env, "https://metadata.example.com/credit")
        );
        
        // Retire credits
        let certificate_id = CarbonCreditPlatform::retire_credits(
            env.clone(),
            owner.clone(),
            token_ids.clone(),
            String::from_str_slice(&env, "Corporate sustainability commitment")
        );
        
        // Verify retirement certificate
        let certificate = CarbonCreditPlatform::get_certificate(env.clone(), certificate_id);
        assert_eq!(certificate.beneficiary, owner);
        assert_eq!(certificate.total_tonnes, 3);
        assert_eq!(certificate.reason, String::from_str_slice(&env, "Corporate sustainability commitment"));
        
        // Verify credits are retired
        for token_id in token_ids.iter() {
            let credit = CarbonCreditPlatform::get_credit(env.clone(), *token_id);
            assert!(credit.retired);
            assert_eq!(credit.retirement_reason, Some(String::from_str_slice(&env, "Corporate sustainability commitment")));
        }
    }

    #[test]
    fn test_user_portfolio_tracking() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        
        CarbonCreditPlatform::init(env.clone(), admin.clone());
        
        // Register project and mint credits
        let project_id = CarbonCreditPlatform::register_project(
            env.clone(),
            user.clone(),
            String::from_str_slice(&env, "Test Project"),
            Symbol::new(&env, "forestry"),
            Symbol::new(&env, "US"),
            1000,
            Symbol::new(&env, "AMS001"),
            String::from_str_slice(&env, "https://metadata.example.com")
        );
        
        let token_ids = CarbonCreditPlatform::mint_credits(
            env.clone(),
            user.clone(),
            project_id,
            2,
            2023,
            Symbol::new(&env, "Verra"),
            String::from_str_slice(&env, "https://metadata.example.com/credit")
        );
        
        // Check user's credits
        let user_credits = CarbonCreditPlatform::get_user_credits(env.clone(), user.clone());
        assert_eq!(user_credits.len(), 2);
        
        // Retire one credit
        let retire_tokens = Vec::from_array(&env, [token_ids.get(0).unwrap()]);
        let certificate_id = CarbonCreditPlatform::retire_credits(
            env.clone(),
            user.clone(),
            retire_tokens,
            String::from_str_slice(&env, "Test retirement")
        );
        
        // Check user's credits after retirement
        let updated_credits = CarbonCreditPlatform::get_user_credits(env.clone(), user.clone());
        assert_eq!(updated_credits.len(), 1);
        
        // Check user's certificates
        let user_certificates = CarbonCreditPlatform::get_user_certificates(env.clone(), user.clone());
        assert_eq!(user_certificates.len(), 1);
        assert_eq!(user_certificates.get(0).unwrap(), &certificate_id);
    }

    #[test]
    fn test_verification_workflow() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);
        let requester = Address::generate(&env);
        
        VerificationSystem::init(env.clone(), admin.clone());
        
        // Register verifier
        VerificationSystem::register_verifier(
            env.clone(),
            verifier.clone(),
            String::from_str_slice(&env, "Test Verification Org"),
            String::from_str_slice(&env, "ACC-123"),
            Symbol::new(&env, "Verra"),
            Vec::new(&env),
            String::from_str_slice(&env, "https://metadata.example.com")
        );
        
        // Approve verifier
        VerificationSystem::approve_verifier(env.clone(), admin.clone(), verifier.clone());
        
        // Create verification request
        let request_id = VerificationSystem::create_verification_request(
            env.clone(),
            requester.clone(),
            Symbol::new(&env, "PROJ_1"),
            VerificationType::InitialVerification,
            String::from_str_slice(&env, "Initial verification")
        );
        
        // Assign verifier
        VerificationSystem::assign_verifier(env.clone(), admin.clone(), request_id, verifier.clone());
        
        // Check verifier's assigned requests
        let verifier_requests = VerificationSystem::get_verifier_requests(env.clone(), verifier);
        assert_eq!(verifier_requests.len(), 1);
        assert_eq!(verifier_requests.get(0).unwrap(), &request_id);
        
        // Check project's verification history
        let project_history = VerificationSystem::get_project_verification_history(env.clone(), Symbol::new(&env, "PROJ_1"));
        assert_eq!(project_history.len(), 1);
        assert_eq!(project_history.get(0).unwrap(), &request_id);
    }
}
