#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MatchingError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    DeveloperNotFound = 4,
    TeamNotFound = 5,
    AlreadyInTeam = 6,
    TeamFull = 7,
    TeamClosed = 8,
    NoActiveRequest = 9,
    NoActiveInvitation = 10,
    InvalidSkillVerificationContract = 11,
    AlreadyRegistered = 12,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SkillLevel {
    Beginner = 0,
    Intermediate = 1,
    Advanced = 2,
    Expert = 3,
}

#[soroban_sdk::contractclient(name = "SkillVerificationClient")]
pub trait SkillVerification {
    fn verify_skill(
        env: soroban_sdk::Env,
        user: soroban_sdk::Address,
        skill: soroban_sdk::Symbol,
        min_level: SkillLevel,
    ) -> bool;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Developer {
    pub address: Address,
    pub skills: Vec<Symbol>,
    pub preferred_role: Symbol,
    pub team_id: u64, // 0 means no team
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Team {
    pub id: u64,
    pub creator: Address,
    pub name: Symbol,
    pub required_skills: Vec<Symbol>,
    pub required_roles: Vec<Symbol>,
    pub members: Vec<Address>,
    pub max_members: u32,
    pub closed: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    SkillVerifier,
    NextTeamId,
    Developer(Address),
    Team(u64),
    JoinRequests(u64),    // Vec<Address>
    Invitations(Address), // Vec<u64>
    AllDevelopers,        // Vec<Address>
}

#[contract]
pub struct HackathonTeamMatching;

#[contractimpl]
impl HackathonTeamMatching {
    /// Initialize the contract with admin and skill verification contract addresses
    pub fn initialize(env: Env, admin: Address, skill_verifier: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, MatchingError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::SkillVerifier, &skill_verifier);
        env.storage().instance().set(&DataKey::NextTeamId, &1u64);
        env.storage()
            .persistent()
            .set(&DataKey::AllDevelopers, &Vec::<Address>::new(&env));
    }

    /// Register a developer profile
    pub fn register_developer(
        env: Env,
        developer: Address,
        skills: Vec<Symbol>,
        preferred_role: Symbol,
    ) {
        developer.require_auth();
        if env
            .storage()
            .persistent()
            .has(&DataKey::Developer(developer.clone()))
        {
            panic_with_error!(&env, MatchingError::AlreadyRegistered);
        }

        let dev = Developer {
            address: developer.clone(),
            skills,
            preferred_role,
            team_id: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Developer(developer.clone()), &dev);

        let mut all_devs: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::AllDevelopers)
            .unwrap_or(Vec::new(&env));
        all_devs.push_back(developer.clone());
        env.storage()
            .persistent()
            .set(&DataKey::AllDevelopers, &all_devs);

        env.events()
            .publish((symbol_short!("dev_reg"), developer), ());
    }

    /// Retrieve a developer profile
    pub fn get_developer(env: Env, developer: Address) -> Option<Developer> {
        env.storage()
            .persistent()
            .get(&DataKey::Developer(developer))
    }

    /// Create a team
    pub fn create_team(
        env: Env,
        creator: Address,
        name: Symbol,
        required_skills: Vec<Symbol>,
        required_roles: Vec<Symbol>,
        max_members: u32,
    ) -> u64 {
        creator.require_auth();

        let mut creator_dev = env
            .storage()
            .persistent()
            .get(&DataKey::Developer(creator.clone()))
            .unwrap_or(Developer {
                address: creator.clone(),
                skills: Vec::new(&env),
                preferred_role: Symbol::new(&env, "creator"),
                team_id: 0,
            });

        if creator_dev.team_id != 0 {
            panic_with_error!(&env, MatchingError::AlreadyInTeam);
        }

        let team_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTeamId)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&DataKey::NextTeamId, &(team_id + 1));

        let mut members = Vec::new(&env);
        members.push_back(creator.clone());

        let team = Team {
            id: team_id,
            creator: creator.clone(),
            name: name.clone(),
            required_skills,
            required_roles,
            members,
            max_members,
            closed: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Team(team_id), &team);

        creator_dev.team_id = team_id;
        env.storage()
            .persistent()
            .set(&DataKey::Developer(creator.clone()), &creator_dev);

        env.events()
            .publish((symbol_short!("team_new"), creator), (team_id, name));
        team_id
    }

    /// Retrieve a team
    pub fn get_team(env: Env, team_id: u64) -> Option<Team> {
        env.storage().persistent().get(&DataKey::Team(team_id))
    }

    /// A developer requests to join a team
    pub fn request_to_join(env: Env, developer: Address, team_id: u64) {
        developer.require_auth();

        let dev = env
            .storage()
            .persistent()
            .get::<_, Developer>(&DataKey::Developer(developer.clone()))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();

        if dev.team_id != 0 {
            panic_with_error!(&env, MatchingError::AlreadyInTeam);
        }

        let team = env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::TeamNotFound))
            .unwrap();

        if team.closed {
            panic_with_error!(&env, MatchingError::TeamClosed);
        }
        if team.members.len() >= team.max_members {
            panic_with_error!(&env, MatchingError::TeamFull);
        }

        let mut requests: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::JoinRequests(team_id))
            .unwrap_or(Vec::new(&env));

        let mut exists = false;
        for r in requests.iter() {
            if r == developer {
                exists = true;
                break;
            }
        }
        if !exists {
            requests.push_back(developer.clone());
            env.storage()
                .persistent()
                .set(&DataKey::JoinRequests(team_id), &requests);
        }

        env.events()
            .publish((symbol_short!("join_req"), developer), team_id);
    }

    /// Accept a developer's join request (team creator only)
    pub fn accept_join_request(env: Env, creator: Address, developer: Address, team_id: u64) {
        creator.require_auth();

        let mut team = env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::TeamNotFound))
            .unwrap();

        if team.creator != creator {
            panic_with_error!(&env, MatchingError::Unauthorized);
        }
        if team.closed {
            panic_with_error!(&env, MatchingError::TeamClosed);
        }
        if team.members.len() >= team.max_members {
            panic_with_error!(&env, MatchingError::TeamFull);
        }

        let mut requests: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::JoinRequests(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::NoActiveRequest))
            .unwrap();

        let mut found_index = None;
        for i in 0..requests.len() {
            if requests.get(i).unwrap() == developer {
                found_index = Some(i);
                break;
            }
        }

        let idx = found_index
            .ok_or_else(|| panic_with_error!(&env, MatchingError::NoActiveRequest))
            .unwrap();
        requests.remove(idx);
        env.storage()
            .persistent()
            .set(&DataKey::JoinRequests(team_id), &requests);

        let mut dev = env
            .storage()
            .persistent()
            .get::<_, Developer>(&DataKey::Developer(developer.clone()))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();

        if dev.team_id != 0 {
            panic_with_error!(&env, MatchingError::AlreadyInTeam);
        }

        dev.team_id = team_id;
        team.members.push_back(developer.clone());

        env.storage()
            .persistent()
            .set(&DataKey::Developer(developer.clone()), &dev);
        env.storage()
            .persistent()
            .set(&DataKey::Team(team_id), &team);

        env.events()
            .publish((symbol_short!("join_acc"), creator), (developer, team_id));
    }

    /// Invite a developer to join the team (team creator only)
    pub fn invite_developer(env: Env, creator: Address, developer: Address, team_id: u64) {
        creator.require_auth();

        let team = env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::TeamNotFound))
            .unwrap();

        if team.creator != creator {
            panic_with_error!(&env, MatchingError::Unauthorized);
        }
        if team.closed {
            panic_with_error!(&env, MatchingError::TeamClosed);
        }
        if team.members.len() >= team.max_members {
            panic_with_error!(&env, MatchingError::TeamFull);
        }

        let dev = env
            .storage()
            .persistent()
            .get::<_, Developer>(&DataKey::Developer(developer.clone()))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();

        if dev.team_id != 0 {
            panic_with_error!(&env, MatchingError::AlreadyInTeam);
        }

        let mut invites: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::Invitations(developer.clone()))
            .unwrap_or(Vec::new(&env));

        let mut exists = false;
        for id in invites.iter() {
            if id == team_id {
                exists = true;
                break;
            }
        }
        if !exists {
            invites.push_back(team_id);
            env.storage()
                .persistent()
                .set(&DataKey::Invitations(developer.clone()), &invites);
        }

        env.events()
            .publish((symbol_short!("invite_d"), creator), (developer, team_id));
    }

    /// Accept a team's invitation (developer only)
    pub fn accept_invitation(env: Env, developer: Address, team_id: u64) {
        developer.require_auth();

        let mut dev = env
            .storage()
            .persistent()
            .get::<_, Developer>(&DataKey::Developer(developer.clone()))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();

        if dev.team_id != 0 {
            panic_with_error!(&env, MatchingError::AlreadyInTeam);
        }

        let mut team = env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::TeamNotFound))
            .unwrap();

        if team.closed {
            panic_with_error!(&env, MatchingError::TeamClosed);
        }
        if team.members.len() >= team.max_members {
            panic_with_error!(&env, MatchingError::TeamFull);
        }

        let mut invites: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::Invitations(developer.clone()))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::NoActiveInvitation))
            .unwrap();

        let mut found_index = None;
        for i in 0..invites.len() {
            if invites.get(i).unwrap() == team_id {
                found_index = Some(i);
                break;
            }
        }

        let idx = found_index
            .ok_or_else(|| panic_with_error!(&env, MatchingError::NoActiveInvitation))
            .unwrap();
        invites.remove(idx);
        env.storage()
            .persistent()
            .set(&DataKey::Invitations(developer.clone()), &invites);

        dev.team_id = team_id;
        team.members.push_back(developer.clone());

        env.storage()
            .persistent()
            .set(&DataKey::Developer(developer.clone()), &dev);
        env.storage()
            .persistent()
            .set(&DataKey::Team(team_id), &team);

        env.events()
            .publish((symbol_short!("invite_a"), developer), team_id);
    }

    /// Leave the current team (non-creator member only)
    pub fn leave_team(env: Env, developer: Address, team_id: u64) {
        developer.require_auth();

        let mut dev = env
            .storage()
            .persistent()
            .get::<_, Developer>(&DataKey::Developer(developer.clone()))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();

        if dev.team_id != team_id {
            panic_with_error!(&env, MatchingError::Unauthorized);
        }

        let mut team = env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::TeamNotFound))
            .unwrap();

        if team.closed {
            panic_with_error!(&env, MatchingError::TeamClosed);
        }
        if team.creator == developer {
            panic_with_error!(&env, MatchingError::Unauthorized);
        }

        let mut found_index = None;
        for i in 0..team.members.len() {
            if team.members.get(i).unwrap() == developer {
                found_index = Some(i);
                break;
            }
        }

        let idx = found_index
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();
        team.members.remove(idx);
        dev.team_id = 0;

        env.storage()
            .persistent()
            .set(&DataKey::Developer(developer.clone()), &dev);
        env.storage()
            .persistent()
            .set(&DataKey::Team(team_id), &team);

        env.events()
            .publish((symbol_short!("team_lv"), developer), team_id);
    }

    /// Remove a member from the team (team creator only)
    pub fn remove_member(env: Env, creator: Address, developer: Address, team_id: u64) {
        creator.require_auth();

        let mut team = env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::TeamNotFound))
            .unwrap();

        if team.creator != creator {
            panic_with_error!(&env, MatchingError::Unauthorized);
        }
        if team.closed {
            panic_with_error!(&env, MatchingError::TeamClosed);
        }
        if developer == creator {
            panic_with_error!(&env, MatchingError::Unauthorized);
        }

        let mut found_index = None;
        for i in 0..team.members.len() {
            if team.members.get(i).unwrap() == developer {
                found_index = Some(i);
                break;
            }
        }

        let idx = found_index
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();
        team.members.remove(idx);

        let mut dev = env
            .storage()
            .persistent()
            .get::<_, Developer>(&DataKey::Developer(developer.clone()))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::DeveloperNotFound))
            .unwrap();

        if dev.team_id == team_id {
            dev.team_id = 0;
            env.storage()
                .persistent()
                .set(&DataKey::Developer(developer.clone()), &dev);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Team(team_id), &team);

        env.events()
            .publish((symbol_short!("team_rm"), creator), (developer, team_id));
    }

    /// Close the team, finalizing members (team creator only)
    pub fn close_team(env: Env, creator: Address, team_id: u64) {
        creator.require_auth();

        let mut team = env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
            .ok_or_else(|| panic_with_error!(&env, MatchingError::TeamNotFound))
            .unwrap();

        if team.creator != creator {
            panic_with_error!(&env, MatchingError::Unauthorized);
        }

        team.closed = true;
        env.storage()
            .persistent()
            .set(&DataKey::Team(team_id), &team);

        env.events()
            .publish((symbol_short!("team_cls"), creator), team_id);
    }

    /// Find matching teams for a developer
    pub fn find_matching_teams(env: Env, developer: Address) -> Vec<u64> {
        let dev = match env
            .storage()
            .persistent()
            .get::<_, Developer>(&DataKey::Developer(developer))
        {
            Some(d) => d,
            None => return Vec::new(&env),
        };

        let next_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTeamId)
            .unwrap_or(1);
        let mut matched_teams = Vec::new(&env);

        for id in 1..next_id {
            if let Some(team) = env
                .storage()
                .persistent()
                .get::<_, Team>(&DataKey::Team(id))
            {
                if team.closed || team.members.len() >= team.max_members {
                    continue;
                }

                // Check role match
                let mut role_match = false;
                for r in team.required_roles.iter() {
                    if r == dev.preferred_role {
                        role_match = true;
                        break;
                    }
                }

                // Check skill match
                let mut skill_match = false;
                for s in team.required_skills.iter() {
                    for ds in dev.skills.iter() {
                        if s == ds {
                            skill_match = true;
                            break;
                        }
                    }
                    if skill_match {
                        break;
                    }
                }

                if role_match || skill_match {
                    matched_teams.push_back(id);
                }
            }
        }

        matched_teams
    }

    /// Find matching developers for a team
    pub fn find_matching_developers(env: Env, team_id: u64) -> Vec<Address> {
        let team = match env
            .storage()
            .persistent()
            .get::<_, Team>(&DataKey::Team(team_id))
        {
            Some(t) => t,
            None => return Vec::new(&env),
        };

        let all_devs: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::AllDevelopers)
            .unwrap_or(Vec::new(&env));

        let mut matched_devs = Vec::new(&env);

        for dev_addr in all_devs.iter() {
            if let Some(dev) = env
                .storage()
                .persistent()
                .get::<_, Developer>(&DataKey::Developer(dev_addr.clone()))
            {
                if dev.team_id != 0 {
                    continue;
                }

                // Check role match
                let mut role_match = false;
                for r in team.required_roles.iter() {
                    if r == dev.preferred_role {
                        role_match = true;
                        break;
                    }
                }

                // Check skill match
                let mut skill_match = false;
                for s in team.required_skills.iter() {
                    for ds in dev.skills.iter() {
                        if s == ds {
                            skill_match = true;
                            break;
                        }
                    }
                    if skill_match {
                        break;
                    }
                }

                if role_match || skill_match {
                    matched_devs.push_back(dev_addr);
                }
            }
        }

        matched_devs
    }

    /// Check if a developer's skill is verified via the SkillVerificationContract
    pub fn check_skill_verified(env: Env, developer: Address, skill: Symbol) -> bool {
        let verifier_opt: Option<Address> = env.storage().instance().get(&DataKey::SkillVerifier);
        if let Some(verifier) = verifier_opt {
            let client = SkillVerificationClient::new(&env, &verifier);
            client.verify_skill(&developer, &skill, &SkillLevel::Beginner)
        } else {
            false
        }
    }
}

#[cfg(test)]
mod test;
