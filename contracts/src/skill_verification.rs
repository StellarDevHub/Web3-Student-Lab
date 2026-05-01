//! On-chain skill attestation, verification badges, and credential storage.
#![allow(dead_code)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

pub const MAX_ATTESTERS: u32 = 50;
pub const ATTESTATION_TTL_LEDGERS: u64 = 12_614_400; // ~2 years

// ── Types ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SkillLevel {
    Beginner,
    Intermediate,
    Advanced,
    Expert,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SkillAttestation {
    pub skill: Symbol,
    pub level: SkillLevel,
    pub attester: Address,
    pub attested_at: u64,
    pub expires_at: u64,
    pub score: u32, // 0-100
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SkillProfile {
    pub owner: Address,
    pub attestations: Vec<SkillAttestation>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationBadge {
    pub skill: Symbol,
    pub level: SkillLevel,
    pub issued_at: u64,
    pub issuer: Address,
}

#[contracttype]
#[derive(Clone)]
pub enum SkillKey {
    Admin,
    Attester(Address),
    Profile(Address),
    Badges(Address),
}

// ── Contract ───────────────────────────────────────────────────────────────

#[contract]
pub struct SkillVerificationContract;

#[contractimpl]
impl SkillVerificationContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&SkillKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&SkillKey::Admin, &admin);
    }

    /// Admin registers a trusted attester.
    pub fn add_attester(env: Env, attester: Address) {
        Self::require_admin(&env);
        env.storage()
            .persistent()
            .set(&SkillKey::Attester(attester.clone()), &true);
        env.events().publish(
            (soroban_sdk::symbol_short!("attester"), soroban_sdk::symbol_short!("added")),
            attester,
        );
    }

    /// Admin removes an attester.
    pub fn remove_attester(env: Env, attester: Address) {
        Self::require_admin(&env);
        env.storage()
            .persistent()
            .set(&SkillKey::Attester(attester.clone()), &false);
        env.events().publish(
            (soroban_sdk::symbol_short!("attester"), soroban_sdk::symbol_short!("removed")),
            attester,
        );
    }

    /// Trusted attester attests a skill for a user.
    pub fn attest_skill(
        env: Env,
        attester: Address,
        user: Address,
        skill: Symbol,
        level: SkillLevel,
        score: u32,
    ) {
        attester.require_auth();
        assert!(Self::is_attester(&env, &attester), "not a trusted attester");
        assert!(score <= 100, "score must be 0-100");

        let now = env.ledger().sequence() as u64;
        let attestation = SkillAttestation {
            skill: skill.clone(),
            level,
            attester: attester.clone(),
            attested_at: now,
            expires_at: now + ATTESTATION_TTL_LEDGERS,
            score,
        };

        let mut profile = Self::get_or_default_profile(&env, &user);
        // Replace existing attestation for same skill+attester pair, or append
        let mut replaced = false;
        for i in 0..profile.attestations.len() {
            let a = profile.attestations.get(i).unwrap();
            if a.skill == skill && a.attester == attester {
                profile.attestations.set(i, attestation.clone());
                replaced = true;
                break;
            }
        }
        if !replaced {
            profile.attestations.push_back(attestation.clone());
        }

        env.storage()
            .persistent()
            .set(&SkillKey::Profile(user.clone()), &profile);

        // Auto-issue badge if score >= 70
        if score >= 70 {
            Self::issue_badge_internal(&env, &user, skill.clone(), level, attester.clone());
        }

        env.events().publish(
            (soroban_sdk::symbol_short!("attested"), attester),
            (user, skill, level as u32, score),
        );
    }

    /// Check whether a user holds a valid (non-expired) attestation for a skill at minimum level.
    pub fn verify_skill(
        env: Env,
        user: Address,
        skill: Symbol,
        min_level: SkillLevel,
    ) -> bool {
        let profile = Self::get_or_default_profile(&env, &user);
        let now = env.ledger().sequence() as u64;
        profile.attestations.iter().any(|a| {
            a.skill == skill
                && a.expires_at > now
                && (a.level as u32) >= (min_level as u32)
        })
    }

    /// Verify that a user has ALL required skills (used by job board).
    pub fn verify_all_skills(
        env: Env,
        user: Address,
        required_skills: Vec<Symbol>,
    ) -> bool {
        for skill in required_skills.iter() {
            if !Self::verify_skill(
                env.clone(),
                user.clone(),
                skill,
                SkillLevel::Beginner,
            ) {
                return false;
            }
        }
        true
    }

    // ── Views ──────────────────────────────────────────────────────────────

    pub fn get_profile(env: Env, user: Address) -> SkillProfile {
        Self::get_or_default_profile(&env, &user)
    }

    pub fn get_badges(env: Env, user: Address) -> Vec<VerificationBadge> {
        env.storage()
            .persistent()
            .get(&SkillKey::Badges(user))
            .unwrap_or(Vec::new(&env))
    }

    pub fn is_trusted_attester(env: Env, attester: Address) -> bool {
        Self::is_attester(&env, &attester)
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&SkillKey::Admin)
            .expect("not initialized");
        admin.require_auth();
    }

    fn is_attester(env: &Env, attester: &Address) -> bool {
        env.storage()
            .persistent()
            .get(&SkillKey::Attester(attester.clone()))
            .unwrap_or(false)
    }

    fn get_or_default_profile(env: &Env, user: &Address) -> SkillProfile {
        env.storage()
            .persistent()
            .get(&SkillKey::Profile(user.clone()))
            .unwrap_or(SkillProfile {
                owner: user.clone(),
                attestations: Vec::new(env),
            })
    }

    fn issue_badge_internal(
        env: &Env,
        user: &Address,
        skill: Symbol,
        level: SkillLevel,
        issuer: Address,
    ) {
        let badge = VerificationBadge {
            skill: skill.clone(),
            level,
            issued_at: env.ledger().sequence() as u64,
            issuer: issuer.clone(),
        };
        let mut badges: Vec<VerificationBadge> = env
            .storage()
            .persistent()
            .get(&SkillKey::Badges(user.clone()))
            .unwrap_or(Vec::new(env));
        // Replace existing badge for same skill
        let mut replaced = false;
        for i in 0..badges.len() {
            if badges.get(i).unwrap().skill == skill {
                badges.set(i, badge.clone());
                replaced = true;
                break;
            }
        }
        if !replaced {
            badges.push_back(badge);
        }
        env.storage()
            .persistent()
            .set(&SkillKey::Badges(user.clone()), &badges);

        env.events().publish(
            (soroban_sdk::symbol_short!("badge"), user.clone()),
            (skill, level as u32, issuer),
        );
    }
}
