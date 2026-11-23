use soroban_sdk::{contracttype, BytesN, Env};

pub const FOURTEEN_DAYS_SECONDS: u64 = 14 * 24 * 60 * 60; // 1,209,600 seconds

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeliverableEscrow {
    pub job_id: u64,
    pub milestone_index: u32,
    pub deliverable_hash: BytesN<32>,
    pub submitted_at: u64,
    pub auto_release_at: u64,
    pub is_released: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum EscrowKey {
    Deliverable(u64, u32), // (job_id, milestone_index)
}

pub struct EscrowManager;

impl EscrowManager {
    /// Record milestone deliverable with cryptographic hash and start 14-day review window
    pub fn record_submission(
        env: &Env,
        job_id: u64,
        milestone_index: u32,
        deliverable_hash: BytesN<32>,
    ) -> DeliverableEscrow {
        let now = env.ledger().timestamp();
        let auto_release_at = now + FOURTEEN_DAYS_SECONDS;

        let escrow = DeliverableEscrow {
            job_id,
            milestone_index,
            deliverable_hash,
            submitted_at: now,
            auto_release_at,
            is_released: false,
        };

        env.storage()
            .persistent()
            .set(&EscrowKey::Deliverable(job_id, milestone_index), &escrow);

        escrow
    }

    /// Retrieve deliverable escrow record
    pub fn get_submission(
        env: &Env,
        job_id: u64,
        milestone_index: u32,
    ) -> Option<DeliverableEscrow> {
        env.storage()
            .persistent()
            .get(&EscrowKey::Deliverable(job_id, milestone_index))
    }

    /// Check if 14-day client review period has elapsed without client response
    pub fn is_eligible_for_auto_release(env: &Env, job_id: u64, milestone_index: u32) -> bool {
        if let Some(escrow) = Self::get_submission(env, job_id, milestone_index) {
            if escrow.is_released {
                return false;
            }
            env.ledger().timestamp() >= escrow.auto_release_at
        } else {
            false
        }
    }

    /// Mark escrow as released
    pub fn mark_released(env: &Env, job_id: u64, milestone_index: u32) {
        if let Some(mut escrow) = Self::get_submission(env, job_id, milestone_index) {
            escrow.is_released = true;
            env.storage()
                .persistent()
                .set(&EscrowKey::Deliverable(job_id, milestone_index), &escrow);
        }
    }
}
