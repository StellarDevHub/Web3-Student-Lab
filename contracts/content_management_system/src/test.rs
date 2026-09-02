#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Env, String,
};
use types::{AccessPolicy, ContentStatus};

fn create_test_env() -> Env {
    let env = Env::default();
    env.ledger().with_mut(|li| {
        li.protocol_version = 22;
        li.timestamp = 12345;
    });
    env
}

fn setup_contract(env: &Env) -> (Address, ContentManagementSystemClient) {
    let admin = Address::generate(env);
    let contract_id = env.register(ContentManagementSystem, ());
    let client = ContentManagementSystemClient::new(env, &contract_id);

    client.initialize(&admin);

    (admin, client)
}

#[test]
fn test_initialize() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(ContentManagementSystem, ());
    let client = ContentManagementSystemClient::new(&env, &contract_id);

    client.initialize(&admin);

    let result = client.get_admin();
    assert_eq!(result, admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_initialize_twice_fails() {
    let env = create_test_env();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    // Try to initialize again
    client.initialize(&admin);
}

#[test]
fn test_add_instructor() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_admin, client) = setup_contract(&env);
    let instructor = Address::generate(&env);

    client.add_instructor(&instructor);

    assert!(client.is_instructor(&instructor));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_add_instructor_twice_fails() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);

    client.add_instructor(&instructor);
    client.add_instructor(&instructor); // Should fail
}

#[test]
fn test_remove_instructor() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);

    client.add_instructor(&instructor);
    assert!(client.is_instructor(&instructor));

    client.remove_instructor(&instructor);
    assert!(!client.is_instructor(&instructor));
}

#[test]
fn test_create_content() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);

    client.add_instructor(&instructor);

    let title = String::from_str(&env, "Introduction to Rust");
    let description = String::from_str(&env, "Learn Rust programming");
    let content_hash = String::from_str(&env, "QmHash123");
    let content_type = String::from_str(&env, "lesson");
    let tags = vec![
        &env,
        String::from_str(&env, "rust"),
        String::from_str(&env, "programming"),
    ];

    let content_id = client.create_content(
        &instructor,
        &title,
        &description,
        &content_hash,
        &content_type,
        &tags,
        &AccessPolicy::Public,
    );

    assert_eq!(content_id, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_create_content_not_instructor_fails() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let non_instructor = Address::generate(&env);

    let title = String::from_str(&env, "Test");
    let description = String::from_str(&env, "Test");
    let content_hash = String::from_str(&env, "QmHash");
    let content_type = String::from_str(&env, "lesson");
    let tags = vec![&env];

    client.create_content(
        &non_instructor,
        &title,
        &description,
        &content_hash,
        &content_type,
        &tags,
        &AccessPolicy::Public,
    );
}

#[test]
fn test_update_content() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    client.add_instructor(&instructor);

    let title = String::from_str(&env, "Title V1");
    let description = String::from_str(&env, "Description V1");
    let content_hash = String::from_str(&env, "QmHashV1");
    let content_type = String::from_str(&env, "lesson");
    let tags = vec![&env];

    let content_id = client.create_content(
        &instructor,
        &title,
        &description,
        &content_hash,
        &content_type,
        &tags,
        &AccessPolicy::Public,
    );

    let new_title = String::from_str(&env, "Title V2");
    let new_description = String::from_str(&env, "Description V2");
    let new_hash = String::from_str(&env, "QmHashV2");
    let new_type = String::from_str(&env, "module");
    let new_tags = vec![&env, String::from_str(&env, "updated")];

    let version = client.update_content(
        &content_id,
        &new_title,
        &new_description,
        &new_hash,
        &new_type,
        &new_tags,
    );

    assert_eq!(version, 2);
}

#[test]
fn test_publish_content() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );

    client.publish_content(&content_id);

    let content = client.get_content(&content_id, &instructor);
    assert_eq!(content.status, ContentStatus::Published);
}

#[test]
fn test_archive_content() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );

    client.publish_content(&content_id);
    client.archive_content(&instructor, &content_id);

    let content = client.get_content(&content_id, &instructor);
    assert_eq!(content.status, ContentStatus::Archived);
}

#[test]
fn test_enroll_student() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    let student = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Enrolled,
    );

    client.publish_content(&content_id);
    client.enroll_student(&student, &content_id);

    assert!(client.is_enrolled(&content_id, &student));
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")]
fn test_enroll_twice_fails() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    let student = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Enrolled,
    );

    client.publish_content(&content_id);
    client.enroll_student(&student, &content_id);
    client.enroll_student(&student, &content_id); // Should fail
}

#[test]
fn test_revoke_enrollment() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    let student = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Enrolled,
    );

    client.publish_content(&content_id);
    client.enroll_student(&student, &content_id);
    assert!(client.is_enrolled(&content_id, &student));

    client.revoke_enrollment(&content_id, &student);
    assert!(!client.is_enrolled(&content_id, &student));
}

#[test]
fn test_access_control_public() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    let anyone = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );

    client.publish_content(&content_id);

    // Anyone can access public content
    let content = client.get_content(&content_id, &anyone);
    assert_eq!(content.content_id, content_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_access_control_enrolled_fails_without_enrollment() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    let student = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Enrolled,
    );

    client.publish_content(&content_id);

    // Should fail - student not enrolled
    client.get_content(&content_id, &student);
}

#[test]
fn test_access_control_enrolled_succeeds_with_enrollment() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    let student = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Enrolled,
    );

    client.publish_content(&content_id);
    client.enroll_student(&student, &content_id);

    // Should succeed - student enrolled
    let content = client.get_content(&content_id, &student);
    assert_eq!(content.content_id, content_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_access_control_restricted() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    let other_user = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Restricted,
    );

    client.publish_content(&content_id);

    // Should fail - restricted to instructor and admin only
    client.get_content(&content_id, &other_user);
}

#[test]
fn test_list_public_content() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    client.add_instructor(&instructor);

    // Create public content
    let id1 = client.create_content(
        &instructor,
        &String::from_str(&env, "Title 1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash1"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );
    client.publish_content(&id1);

    // Create private content
    let id2 = client.create_content(
        &instructor,
        &String::from_str(&env, "Title 2"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash2"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Restricted,
    );
    client.publish_content(&id2);

    let public_list = client.list_public_content();

    assert_eq!(public_list.len(), 1);
    assert_eq!(public_list.get(0).unwrap(), id1);
}

#[test]
fn test_list_content_by_instructor() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor1 = Address::generate(&env);
    let instructor2 = Address::generate(&env);
    client.add_instructor(&instructor1);
    client.add_instructor(&instructor2);

    let id1 = client.create_content(
        &instructor1,
        &String::from_str(&env, "Title 1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash1"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );

    let id2 = client.create_content(
        &instructor1,
        &String::from_str(&env, "Title 2"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash2"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );

    client.create_content(
        &instructor2,
        &String::from_str(&env, "Title 3"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHash3"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );

    let list = client.list_content_by_instructor(&instructor1);

    assert_eq!(list.len(), 2);
    assert_eq!(list.get(0).unwrap(), id1);
    assert_eq!(list.get(1).unwrap(), id2);
}

#[test]
fn test_content_versioning() {
    let env = create_test_env();
    env.mock_all_auths();

    let (_, client) = setup_contract(&env);
    let instructor = Address::generate(&env);
    client.add_instructor(&instructor);

    let content_id = client.create_content(
        &instructor,
        &String::from_str(&env, "Title V1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHashV1"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
        &AccessPolicy::Public,
    );

    client.publish_content(&content_id);

    // Get version 1
    let v1_hash = client.get_content_version(&content_id, &1, &instructor);
    assert_eq!(v1_hash, String::from_str(&env, "QmHashV1"));

    // Update to version 2
    client.update_content(
        &content_id,
        &String::from_str(&env, "Title V2"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "QmHashV2"),
        &String::from_str(&env, "lesson"),
        &vec![&env],
    );

    // Version 1 should still be accessible
    let v1_hash_again = client.get_content_version(&content_id, &1, &instructor);
    assert_eq!(v1_hash_again, String::from_str(&env, "QmHashV1"));

    // Version 2 should be accessible
    let v2_hash = client.get_content_version(&content_id, &2, &instructor);
    assert_eq!(v2_hash, String::from_str(&env, "QmHashV2"));
}
