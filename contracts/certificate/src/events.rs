use contract_events::{
    publish_certificate_admin_initialized, publish_certificate_issued,
    publish_certificate_reissued, publish_certificate_revoked, publish_certificate_royalty_updated,
    publish_cohort_anchored,
};
use soroban_sdk::{Address, BytesN, Env, String};

pub fn initialized(env: &Env, admin: &Address) {
    publish_certificate_admin_initialized(env, admin);
}

pub fn issued(
    env: &Env,
    owner: &Address,
    issuer: &Address,
    cert_id: &BytesN<32>,
    course_id: &String,
    content_hash: &BytesN<32>,
) {
    publish_certificate_issued(env, owner, issuer, cert_id, course_id, content_hash);
}

pub fn revoked(
    env: &Env,
    owner: &Address,
    issuer: &Address,
    cert_id: &BytesN<32>,
    reason: &String,
) {
    publish_certificate_revoked(env, owner, issuer, cert_id, reason);
}

pub fn reissued(
    env: &Env,
    owner: &Address,
    issuer: &Address,
    old_cert_id: &BytesN<32>,
    new_cert_id: &BytesN<32>,
) {
    publish_certificate_reissued(env, owner, issuer, old_cert_id, new_cert_id);
}

pub fn royalty_updated(
    env: &Env,
    owner: &Address,
    cert_id: &BytesN<32>,
    issuer: &Address,
    royalty_bps: u32,
) {
    publish_certificate_royalty_updated(env, owner, cert_id, issuer, royalty_bps);
}

pub fn cohort_anchored(env: &Env, cohort_id: &String, issuer: &Address, root_hash: &BytesN<32>) {
    publish_cohort_anchored(env, cohort_id, issuer, root_hash);
}
