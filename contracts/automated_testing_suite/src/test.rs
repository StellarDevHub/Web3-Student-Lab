#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

fn create_test_env() -> Env {
    let env = Env::default();
    env.ledger().with_mut(|li| {
        li.protocol_version = 22;
        li.timestamp = 12345;
    });
    env
}

#[test]
fn test_initialize() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);
}

#[test]
fn test_create_module() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    let module_id = client.create_module(
        &creator,
        &String::from_str(&env, "Rust Basics"),
        &String::from_str(&env, "Learn Rust fundamentals"),
    );

    assert_eq!(module_id, 0);

    let module = client.get_module(&module_id).unwrap();
    assert_eq!(module.test_count, 0);
}

#[test]
fn test_add_test() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    let module_id = client.create_module(
        &creator,
        &String::from_str(&env, "Rust Basics"),
        &String::from_str(&env, "Learn Rust"),
    );

    let test_id = client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test Variable Declaration"),
        &String::from_str(&env, "let x = 5"),
        &String::from_str(&env, "5"),
        &10,
    );

    assert_eq!(test_id, 0);

    let test = client.get_test(&test_id).unwrap();
    assert_eq!(test.module_id, module_id);
    assert_eq!(test.score, 10);
}

#[test]
fn test_submit_result_pass() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    let module_id = client.create_module(
        &creator,
        &String::from_str(&env, "Module 1"),
        &String::from_str(&env, "Test module"),
    );

    let test_id = client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 1"),
        &String::from_str(&env, "test data"),
        &String::from_str(&env, "expected"),
        &10,
    );

    // Submit correct result
    let passed = client.submit_result(&user, &test_id, &String::from_str(&env, "expected"));
    assert_eq!(passed, true);

    // Check progress
    let progress = client.get_user_progress(&user, &module_id).unwrap();
    assert_eq!(progress.tests_passed, 1);
    assert_eq!(progress.total_score, 10);
}

#[test]
fn test_submit_result_fail() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    let module_id = client.create_module(
        &creator,
        &String::from_str(&env, "Module 1"),
        &String::from_str(&env, "Test module"),
    );

    let test_id = client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 1"),
        &String::from_str(&env, "test data"),
        &String::from_str(&env, "expected"),
        &10,
    );

    // Submit wrong result
    let passed = client.submit_result(&user, &test_id, &String::from_str(&env, "wrong"));
    assert_eq!(passed, false);

    // Check progress
    let progress = client.get_user_progress(&user, &module_id).unwrap();
    assert_eq!(progress.tests_passed, 0);
    assert_eq!(progress.total_score, 0);
}

#[test]
fn test_list_modules() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    client.create_module(
        &creator,
        &String::from_str(&env, "Module 1"),
        &String::from_str(&env, "Description 1"),
    );

    client.create_module(
        &creator,
        &String::from_str(&env, "Module 2"),
        &String::from_str(&env, "Description 2"),
    );

    let modules = client.list_modules();
    assert_eq!(modules.len(), 2);
}

#[test]
fn test_list_module_tests() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    let module_id = client.create_module(
        &creator,
        &String::from_str(&env, "Module 1"),
        &String::from_str(&env, "Description"),
    );

    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 1"),
        &String::from_str(&env, "data 1"),
        &String::from_str(&env, "result 1"),
        &10,
    );

    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 2"),
        &String::from_str(&env, "data 2"),
        &String::from_str(&env, "result 2"),
        &15,
    );

    let tests = client.list_module_tests(&module_id);
    assert_eq!(tests.len(), 2);
}

#[test]
fn test_get_completion() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    let module_id = client.create_module(
        &creator,
        &String::from_str(&env, "Module 1"),
        &String::from_str(&env, "Description"),
    );

    // Add 4 tests
    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 0"),
        &String::from_str(&env, "data"),
        &String::from_str(&env, "result0"),
        &10,
    );
    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 1"),
        &String::from_str(&env, "data"),
        &String::from_str(&env, "result1"),
        &10,
    );
    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 2"),
        &String::from_str(&env, "data"),
        &String::from_str(&env, "result2"),
        &10,
    );
    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 3"),
        &String::from_str(&env, "data"),
        &String::from_str(&env, "result3"),
        &10,
    );

    // Complete 2 tests
    client.submit_result(&user, &0, &String::from_str(&env, "result0"));
    client.submit_result(&user, &1, &String::from_str(&env, "result1"));

    // Check completion percentage
    let completion = client.get_completion(&user, &module_id);
    assert_eq!(completion, 50); // 2 out of 4 = 50%
}

#[test]
fn test_run_test_suite() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(AutomatedTestingSuite, ());
    let client = AutomatedTestingSuiteClient::new(&env, &contract_id);

    client.initialize(&admin);

    let module_id = client.create_module(
        &creator,
        &String::from_str(&env, "Module 1"),
        &String::from_str(&env, "Description"),
    );

    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 1"),
        &String::from_str(&env, "data"),
        &String::from_str(&env, "result"),
        &10,
    );

    client.add_test(
        &creator,
        &module_id,
        &String::from_str(&env, "Test 2"),
        &String::from_str(&env, "data"),
        &String::from_str(&env, "result"),
        &20,
    );

    let total_score = client.run_test_suite(&user, &module_id);
    assert_eq!(total_score, 30); // 10 + 20
}
