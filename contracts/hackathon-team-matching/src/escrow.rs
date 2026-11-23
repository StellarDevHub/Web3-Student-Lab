use soroban_sdk::{contracterror, contracttype, panic_with_error, token, Address, Env, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EscrowError {
    TeamNotFound = 20,
    InvalidMilestones = 21,
    InvalidExpiration = 22,
    InvalidArbiters = 23,
    AmountOverflow = 24,
    EscrowNotFound = 25,
    EscrowExpired = 26,
    NotParticipant = 27,
    AlreadyVoted = 28,
    MilestoneNotPending = 29,
    NotDisputed = 30,
    NotExpired = 31,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    Pending,
    Disputed,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub amount: i128,
    pub status: MilestoneStatus,
    pub sponsor_voted: bool,
    pub sponsor_approved: bool,
    pub team_approvals: Vec<Address>,
    pub team_rejections: Vec<Address>,
    pub arbiter_release_votes: Vec<Address>,
    pub arbiter_refund_votes: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HackathonEscrow {
    pub id: u64,
    pub sponsor: Address,
    pub team_id: u64,
    pub team_recipient: Address,
    pub team_members: Vec<Address>,
    pub token: Address,
    pub milestones: Vec<Milestone>,
    pub expires_at: u64,
    pub arbiters: Vec<Address>,
    pub arbiter_threshold: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum EscrowKey {
    NextId,
    Escrow(u64),
}

pub fn load(env: &Env, escrow_id: u64) -> Option<HackathonEscrow> {
    env.storage()
        .persistent()
        .get(&EscrowKey::Escrow(escrow_id))
}

pub fn load_or_fail(env: &Env, escrow_id: u64) -> HackathonEscrow {
    load(env, escrow_id).unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound))
}

pub fn store(env: &Env, escrow: &HackathonEscrow) {
    env.storage()
        .persistent()
        .set(&EscrowKey::Escrow(escrow.id), escrow);
}

pub fn get_milestone(env: &Env, escrow: &HackathonEscrow, index: u32) -> Milestone {
    escrow
        .milestones
        .get(index)
        .unwrap_or_else(|| panic_with_error!(env, EscrowError::InvalidMilestones))
}

pub fn set_milestone(escrow: &mut HackathonEscrow, index: u32, milestone: Milestone) {
    escrow.milestones.set(index, milestone);
}

pub fn release_milestone(env: &Env, escrow: &HackathonEscrow, milestone: &mut Milestone) {
    token::Client::new(env, &escrow.token).transfer(
        &env.current_contract_address(),
        &escrow.team_recipient,
        &milestone.amount,
    );
    milestone.status = MilestoneStatus::Released;
}

pub fn refund_milestone(env: &Env, escrow: &HackathonEscrow, milestone: &mut Milestone) {
    token::Client::new(env, &escrow.token).transfer(
        &env.current_contract_address(),
        &escrow.sponsor,
        &milestone.amount,
    );
    milestone.status = MilestoneStatus::Refunded;
}
