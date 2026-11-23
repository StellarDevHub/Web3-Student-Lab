use contract_events::{publish_standard_event, topic};
use soroban_sdk::{Address, BytesN, Env, String};

pub fn initialized(env: &Env, admin: &Address) {
    publish_standard_event(
        env,
        topic::CERT_ADMIN,
        admin.clone(),
        (env.ledger().timestamp(),),
    );
}

pub fn issued(
    env: &Env,
    owner: &Address,
    issuer: &Address,
    cert_id: &BytesN<32>,
    course_id: &String,
    content_hash: &BytesN<32>,
) {
    publish_standard_event(
        env,
        topic::CERT_ISSUED,
        owner.clone(),
        (
            cert_id.clone(),
            issuer.clone(),
            course_id.clone(),
            content_hash.clone(),
            env.ledger().timestamp(),
        ),
    );
}

pub fn revoked(
    env: &Env,
    owner: &Address,
    issuer: &Address,
    cert_id: &BytesN<32>,
    reason: &String,
) {
    publish_standard_event(
        env,
        topic::CERT_REVOKED,
        owner.clone(),
        (
            cert_id.clone(),
            issuer.clone(),
            reason.clone(),
            env.ledger().timestamp(),
        ),
    );
}

pub fn reissued(
    env: &Env,
    owner: &Address,
    issuer: &Address,
    old_cert_id: &BytesN<32>,
    new_cert_id: &BytesN<32>,
) {
    publish_standard_event(
        env,
        topic::CERT_REISSUED,
        owner.clone(),
        (
            old_cert_id.clone(),
            new_cert_id.clone(),
            issuer.clone(),
            env.ledger().timestamp(),
        ),
    );
}

pub fn royalty_updated(
    env: &Env,
    owner: &Address,
    cert_id: &BytesN<32>,
    issuer: &Address,
    royalty_bps: u32,
) {
    publish_standard_event(
        env,
        topic::CERT_ROYALTY,
        owner.clone(),
        (
            cert_id.clone(),
            issuer.clone(),
            royalty_bps,
            env.ledger().timestamp(),
        ),
    );
}

pub fn cohort_anchored(env: &Env, cohort_id: &String, issuer: &Address, root_hash: &BytesN<32>) {
    publish_standard_event(
        env,
        topic::COHORT_ROOT,
        cohort_id.clone(),
        (issuer.clone(), root_hash.clone(), env.ledger().timestamp()),
    );
}
