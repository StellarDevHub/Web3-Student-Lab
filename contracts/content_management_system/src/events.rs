use crate::types::ContentStatus;
use soroban_sdk::{symbol_short, Address, Env};

// Event: Admin set
pub fn emit_admin_set(env: &Env, admin: &Address) {
    env.events()
        .publish((symbol_short!("admin_set"),), (admin,));
}

// Event: Instructor registry changed
pub fn emit_instructor_registry_changed(env: &Env, instructor: &Address, added: bool) {
    let action = if added {
        symbol_short!("added")
    } else {
        symbol_short!("removed")
    };

    env.events().publish(
        (symbol_short!("inst_reg"), instructor.clone()),
        (action, env.ledger().timestamp()),
    );
}

// Event: Content created
pub fn emit_content_created(env: &Env, content_id: u64, instructor: &Address) {
    env.events().publish(
        (symbol_short!("content"), symbol_short!("created")),
        (content_id, instructor.clone(), env.ledger().timestamp()),
    );
}

// Event: Content updated
pub fn emit_content_updated(env: &Env, content_id: u64, version: u32) {
    env.events().publish(
        (symbol_short!("content"), symbol_short!("updated")),
        (content_id, version, env.ledger().timestamp()),
    );
}

// Event: Content status changed
pub fn emit_content_status_changed(
    env: &Env,
    content_id: u64,
    old_status: &ContentStatus,
    new_status: &ContentStatus,
) {
    env.events().publish(
        (symbol_short!("status"), content_id),
        (
            old_status.clone(),
            new_status.clone(),
            env.ledger().timestamp(),
        ),
    );
}

// Event: Enrollment created
pub fn emit_enrollment_created(env: &Env, student: &Address, content_id: u64) {
    env.events().publish(
        (symbol_short!("enroll"), symbol_short!("created")),
        (student.clone(), content_id, env.ledger().timestamp()),
    );
}

// Event: Enrollment revoked
pub fn emit_enrollment_revoked(env: &Env, student: &Address, content_id: u64) {
    env.events().publish(
        (symbol_short!("enroll"), symbol_short!("revoked")),
        (student.clone(), content_id, env.ledger().timestamp()),
    );
}
