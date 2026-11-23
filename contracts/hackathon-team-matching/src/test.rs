#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, vec, Address, Env};

// --- Mock Skill Verifier Contract ---
#[contract]
pub struct MockSkillVerifier;

#[contractimpl]
impl MockSkillVerifier {
    pub fn verify_skill(env: Env, _user: Address, skill: Symbol, _min_level: SkillLevel) -> bool {
        // In our mock, "rust" and "stellar" are verified, others are not
        skill == Symbol::new(&env, "rust") || skill == Symbol::new(&env, "stellar")
    }
}

// --- Helper function to setup environment ---
fn setup() -> (
    Env,
    Address,
    Address,
    HackathonTeamMatchingClient<'static>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    // Register Mock Skill Verifier
    let verifier_id = env.register(MockSkillVerifier, ());

    // Register Hackathon Team Matching Contract
    let contract_id = env.register(HackathonTeamMatching, ());
    let client = HackathonTeamMatchingClient::new(&env, &contract_id);

    client.initialize(&admin, &verifier_id);

    (env, admin, verifier_id, client, contract_id)
}

#[test]
fn test_initialize_and_registration() {
    let (env, _, _, client, _) = setup();

    let developer = Address::generate(&env);
    let skills = vec![&env, Symbol::new(&env, "rust"), Symbol::new(&env, "react")];
    let preferred_role = Symbol::new(&env, "backend");

    client.register_developer(&developer, &skills, &preferred_role);

    let dev = client.get_developer(&developer).unwrap();
    assert_eq!(dev.address, developer);
    assert_eq!(dev.skills, skills);
    assert_eq!(dev.preferred_role, preferred_role);
    assert_eq!(dev.team_id, 0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #12)")]
fn test_double_registration_fails() {
    let (env, _, _, client, _) = setup();

    let developer = Address::generate(&env);
    let skills = vec![&env, Symbol::new(&env, "rust")];
    let preferred_role = Symbol::new(&env, "backend");

    client.register_developer(&developer, &skills, &preferred_role);
    client.register_developer(&developer, &skills, &preferred_role);
}

#[test]
fn test_create_team() {
    let (env, _, _, client, _) = setup();

    let creator = Address::generate(&env);
    let skills = vec![&env, Symbol::new(&env, "rust")];
    client.register_developer(&creator, &skills, &Symbol::new(&env, "backend"));

    let team_name = Symbol::new(&env, "StellarBuilders");
    let req_skills = vec![
        &env,
        Symbol::new(&env, "react"),
        Symbol::new(&env, "stellar"),
    ];
    let req_roles = vec![
        &env,
        Symbol::new(&env, "frontend"),
        Symbol::new(&env, "designer"),
    ];

    let team_id = client.create_team(&creator, &team_name, &req_skills, &req_roles, &5);
    assert_eq!(team_id, 1);

    let team = client.get_team(&team_id).unwrap();
    assert_eq!(team.id, 1);
    assert_eq!(team.creator, creator);
    assert_eq!(team.name, team_name);
    assert_eq!(team.required_skills, req_skills);
    assert_eq!(team.required_roles, req_roles);
    assert_eq!(team.members.len(), 1);
    assert_eq!(team.members.get(0).unwrap(), creator);
    assert_eq!(team.max_members, 5);
    assert!(!team.closed);

    let dev = client.get_developer(&creator).unwrap();
    assert_eq!(dev.team_id, team_id);
}

#[test]
fn test_join_request_flow() {
    let (env, _, _, client, _) = setup();

    // Create team
    let creator = Address::generate(&env);
    client.register_developer(&creator, &vec![&env], &Symbol::new(&env, "creator"));
    let team_id = client.create_team(
        &creator,
        &Symbol::new(&env, "T1"),
        &vec![&env],
        &vec![&env],
        &2,
    );

    // Register applicant
    let applicant = Address::generate(&env);
    client.register_developer(
        &applicant,
        &vec![&env, Symbol::new(&env, "rust")],
        &Symbol::new(&env, "backend"),
    );

    // Request to join
    client.request_to_join(&applicant, &team_id);

    // Accept join request
    client.accept_join_request(&creator, &applicant, &team_id);

    let team = client.get_team(&team_id).unwrap();
    assert_eq!(team.members.len(), 2);
    assert_eq!(team.members.get(1).unwrap(), applicant);

    let dev = client.get_developer(&applicant).unwrap();
    assert_eq!(dev.team_id, team_id);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_join_request_team_full() {
    let (env, _, _, client, _) = setup();

    // Create team with max_members = 1 (only creator)
    let creator = Address::generate(&env);
    client.register_developer(&creator, &vec![&env], &Symbol::new(&env, "creator"));
    let team_id = client.create_team(
        &creator,
        &Symbol::new(&env, "T1"),
        &vec![&env],
        &vec![&env],
        &1,
    );

    let applicant = Address::generate(&env);
    client.register_developer(&applicant, &vec![&env], &Symbol::new(&env, "backend"));

    client.request_to_join(&applicant, &team_id);
}

#[test]
fn test_invitation_flow() {
    let (env, _, _, client, _) = setup();

    // Create team
    let creator = Address::generate(&env);
    client.register_developer(&creator, &vec![&env], &Symbol::new(&env, "creator"));
    let team_id = client.create_team(
        &creator,
        &Symbol::new(&env, "T1"),
        &vec![&env],
        &vec![&env],
        &3,
    );

    // Register developer
    let developer = Address::generate(&env);
    client.register_developer(&developer, &vec![&env], &Symbol::new(&env, "frontend"));

    // Invite developer
    client.invite_developer(&creator, &developer, &team_id);

    // Accept invitation
    client.accept_invitation(&developer, &team_id);

    let team = client.get_team(&team_id).unwrap();
    assert_eq!(team.members.len(), 2);
    assert_eq!(team.members.get(1).unwrap(), developer);

    let dev = client.get_developer(&developer).unwrap();
    assert_eq!(dev.team_id, team_id);
}

#[test]
fn test_leave_and_remove_member() {
    let (env, _, _, client, _) = setup();

    // Create team
    let creator = Address::generate(&env);
    client.register_developer(&creator, &vec![&env], &Symbol::new(&env, "creator"));
    let team_id = client.create_team(
        &creator,
        &Symbol::new(&env, "T1"),
        &vec![&env],
        &vec![&env],
        &4,
    );

    // Developers
    let dev1 = Address::generate(&env);
    let dev2 = Address::generate(&env);
    client.register_developer(&dev1, &vec![&env], &Symbol::new(&env, "role1"));
    client.register_developer(&dev2, &vec![&env], &Symbol::new(&env, "role2"));

    // Invite and join dev1, dev2
    client.invite_developer(&creator, &dev1, &team_id);
    client.accept_invitation(&dev1, &team_id);

    client.invite_developer(&creator, &dev2, &team_id);
    client.accept_invitation(&dev2, &team_id);

    let team = client.get_team(&team_id).unwrap();
    assert_eq!(team.members.len(), 3);

    // Dev1 leaves team
    client.leave_team(&dev1, &team_id);
    let team = client.get_team(&team_id).unwrap();
    assert_eq!(team.members.len(), 2);
    assert_eq!(client.get_developer(&dev1).unwrap().team_id, 0);

    // Creator removes dev2
    client.remove_member(&creator, &dev2, &team_id);
    let team = client.get_team(&team_id).unwrap();
    assert_eq!(team.members.len(), 1);
    assert_eq!(client.get_developer(&dev2).unwrap().team_id, 0);
}

#[test]
fn test_matching_engine() {
    let (env, _, _, client, _) = setup();

    // Setup Teams
    let creator1 = Address::generate(&env);
    client.register_developer(&creator1, &vec![&env], &Symbol::new(&env, "creator"));
    let team_id1 = client.create_team(
        &creator1,
        &Symbol::new(&env, "StellarBuilders"),
        &vec![
            &env,
            Symbol::new(&env, "rust"),
            Symbol::new(&env, "stellar"),
        ],
        &vec![&env, Symbol::new(&env, "frontend")],
        &5,
    );

    let creator2 = Address::generate(&env);
    client.register_developer(&creator2, &vec![&env], &Symbol::new(&env, "creator"));
    let team_id2 = client.create_team(
        &creator2,
        &Symbol::new(&env, "DeFiYield"),
        &vec![&env, Symbol::new(&env, "solidity")],
        &vec![&env, Symbol::new(&env, "backend")],
        &5,
    );

    // Developer 1: Skills "rust", "react", Role "frontend"
    let dev1 = Address::generate(&env);
    client.register_developer(
        &dev1,
        &vec![&env, Symbol::new(&env, "rust"), Symbol::new(&env, "react")],
        &Symbol::new(&env, "frontend"),
    );

    // Developer 2: Skills "solidity", Role "backend"
    let dev2 = Address::generate(&env);
    client.register_developer(
        &dev2,
        &vec![&env, Symbol::new(&env, "solidity")],
        &Symbol::new(&env, "backend"),
    );

    // Developer 3: Skills "go", Role "designer" (No match for any team)
    let dev3 = Address::generate(&env);
    client.register_developer(
        &dev3,
        &vec![&env, Symbol::new(&env, "go")],
        &Symbol::new(&env, "designer"),
    );

    // Test find_matching_teams for Dev 1 (Should match Team 1 on rust & frontend)
    let matching_teams_dev1 = client.find_matching_teams(&dev1);
    assert_eq!(matching_teams_dev1.len(), 1);
    assert_eq!(matching_teams_dev1.get(0).unwrap(), team_id1);

    // Test find_matching_teams for Dev 2 (Should match Team 2 on solidity & backend)
    let matching_teams_dev2 = client.find_matching_teams(&dev2);
    assert_eq!(matching_teams_dev2.len(), 1);
    assert_eq!(matching_teams_dev2.get(0).unwrap(), team_id2);

    // Test find_matching_teams for Dev 3 (Should match none)
    let matching_teams_dev3 = client.find_matching_teams(&dev3);
    assert_eq!(matching_teams_dev3.len(), 0);

    // Test find_matching_developers for Team 1 (Should match dev1)
    let matching_devs_team1 = client.find_matching_developers(&team_id1);
    assert_eq!(matching_devs_team1.len(), 1);
    assert_eq!(matching_devs_team1.get(0).unwrap(), dev1);
}

#[test]
fn test_check_skill_verified() {
    let (env, _, _, client, _) = setup();

    let dev = Address::generate(&env);
    client.register_developer(&dev, &vec![&env], &Symbol::new(&env, "frontend"));

    // In MockSkillVerifier, "rust" and "stellar" are verified
    assert!(client.check_skill_verified(&dev, &Symbol::new(&env, "rust")));
    assert!(client.check_skill_verified(&dev, &Symbol::new(&env, "stellar")));

    // "solidity" is not verified in MockSkillVerifier
    assert!(!client.check_skill_verified(&dev, &Symbol::new(&env, "solidity")));
}

#[test]
fn test_escrow_releases_only_after_sponsor_and_entire_team_approve() {
    let (env, _, _, client, contract_id) = setup();
    let sponsor = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    token_admin_client.mint(&sponsor, &300);

    let team_lead = Address::generate(&env);
    let team_id = client.create_team(
        &team_lead,
        &Symbol::new(&env, "builders"),
        &vec![&env],
        &vec![&env],
        &3,
    );
    let member = Address::generate(&env);
    client.register_developer(&member, &vec![&env], &Symbol::new(&env, "engineer"));
    client.invite_developer(&team_lead, &member, &team_id);
    client.accept_invitation(&member, &team_id);

    let arbiters = vec![&env, Address::generate(&env), Address::generate(&env)];
    let escrow_id = client.create_escrow(
        &sponsor,
        &team_id,
        &token_id,
        &vec![&env, 100i128, 200i128],
        &100,
        &arbiters,
        &2,
    );

    client.vote_milestone(&sponsor, &escrow_id, &0, &true);
    assert_eq!(token_client.balance(&team_lead), 0);
    client.vote_milestone(&team_lead, &escrow_id, &0, &true);
    assert_eq!(token_client.balance(&team_lead), 0);
    client.vote_milestone(&member, &escrow_id, &0, &true);
    assert_eq!(token_client.balance(&team_lead), 100);
    assert_eq!(token_client.balance(&contract_id), 200);

    let stored = client.get_escrow(&escrow_id).unwrap();
    assert_eq!(
        stored.milestones.get(0).unwrap().status,
        escrow::MilestoneStatus::Released
    );
}

#[test]
fn test_arbiter_threshold_resolves_a_disputed_milestone() {
    let (env, _, _, client, contract_id) = setup();
    let sponsor = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    token_admin_client.mint(&sponsor, &100);

    let team_lead = Address::generate(&env);
    let team_id = client.create_team(
        &team_lead,
        &Symbol::new(&env, "builders"),
        &vec![&env],
        &vec![&env],
        &2,
    );
    let arbiter_one = Address::generate(&env);
    let arbiter_two = Address::generate(&env);
    let escrow_id = client.create_escrow(
        &sponsor,
        &team_id,
        &token_id,
        &vec![&env, 100i128],
        &100,
        &vec![&env, arbiter_one.clone(), arbiter_two.clone()],
        &2,
    );

    client.vote_milestone(&sponsor, &escrow_id, &0, &false);
    client.resolve_dispute(&arbiter_one, &escrow_id, &0, &true);
    assert_eq!(token_client.balance(&team_lead), 0);
    assert_eq!(token_client.balance(&contract_id), 100);

    client.resolve_dispute(&arbiter_two, &escrow_id, &0, &true);
    assert_eq!(token_client.balance(&team_lead), 100);
    assert_eq!(token_client.balance(&contract_id), 0);
}

#[test]
fn test_unclaimed_milestones_refund_after_expiration() {
    let (env, _, _, client, contract_id) = setup();
    let sponsor = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    token_admin_client.mint(&sponsor, &300);

    let team_lead = Address::generate(&env);
    let team_id = client.create_team(
        &team_lead,
        &Symbol::new(&env, "builders"),
        &vec![&env],
        &vec![&env],
        &2,
    );
    let arbiter = Address::generate(&env);
    let escrow_id = client.create_escrow(
        &sponsor,
        &team_id,
        &token_id,
        &vec![&env, 100i128, 200i128],
        &100,
        &vec![&env, arbiter],
        &1,
    );
    client.vote_milestone(&sponsor, &escrow_id, &0, &true);
    client.vote_milestone(&team_lead, &escrow_id, &0, &true);
    assert_eq!(token_client.balance(&team_lead), 100);

    env.ledger().with_mut(|ledger| ledger.timestamp = 100);
    assert_eq!(client.refund_expired(&escrow_id), 200);
    assert_eq!(client.refund_expired(&escrow_id), 0);
    assert_eq!(token_client.balance(&sponsor), 200);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(
        client
            .get_escrow(&escrow_id)
            .unwrap()
            .milestones
            .get(1)
            .unwrap()
            .status,
        escrow::MilestoneStatus::Refunded
    );
}
