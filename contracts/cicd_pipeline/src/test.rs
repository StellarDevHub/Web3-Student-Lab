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
    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);
}

#[test]
fn test_register_repo() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "https://github.com/user/my-repo"),
    );

    assert_eq!(repo_id, 0);

    let repo = client.get_repository(&repo_id).unwrap();
    assert_eq!(repo.owner, owner);
}

#[test]
fn test_create_pipeline() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "https://github.com/user/my-repo"),
    );

    let pipeline_id = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "abc123"),
        &String::from_str(&env, "main"),
    );

    assert_eq!(pipeline_id, 0);

    let pipeline = client.get_pipeline(&pipeline_id).unwrap();
    assert_eq!(pipeline.repo_id, repo_id);
    assert_eq!(pipeline.status, PipelineStatus::Pending);
}

#[test]
fn test_add_stage() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "https://github.com/user/my-repo"),
    );

    let pipeline_id = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "abc123"),
        &String::from_str(&env, "main"),
    );

    let stage_id = client.add_stage(
        &pipeline_id,
        &StageType::Build,
        &String::from_str(&env, "Build Stage"),
    );

    assert_eq!(stage_id, 0);

    let stage = client.get_stage(&stage_id).unwrap();
    assert_eq!(stage.pipeline_id, pipeline_id);
    assert_eq!(stage.stage_type, StageType::Build);
}

#[test]
fn test_update_stage() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "url"),
    );

    let pipeline_id = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "abc123"),
        &String::from_str(&env, "main"),
    );

    let stage_id = client.add_stage(
        &pipeline_id,
        &StageType::Test,
        &String::from_str(&env, "Test Stage"),
    );

    client.update_stage(
        &stage_id,
        &PipelineStatus::Success,
        &120,
        &String::from_str(&env, "All tests passed"),
    );

    let stage = client.get_stage(&stage_id).unwrap();
    assert_eq!(stage.status, PipelineStatus::Success);
    assert_eq!(stage.duration, 120);
}

#[test]
fn test_update_pipeline() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "url"),
    );

    let pipeline_id = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "abc123"),
        &String::from_str(&env, "main"),
    );

    client.update_pipeline(&pipeline_id, &PipelineStatus::Running);

    let pipeline = client.get_pipeline(&pipeline_id).unwrap();
    assert_eq!(pipeline.status, PipelineStatus::Running);

    client.update_pipeline(&pipeline_id, &PipelineStatus::Success);

    let pipeline = client.get_pipeline(&pipeline_id).unwrap();
    assert_eq!(pipeline.status, PipelineStatus::Success);
    assert!(pipeline.completed_at > 0);
}

#[test]
fn test_record_contribution() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let contributor = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "url"),
    );

    let pipeline_id = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "abc123"),
        &String::from_str(&env, "main"),
    );

    let contribution_id = client.record_contribution(&repo_id, &contributor, &pipeline_id, &true);

    assert_eq!(contribution_id, 0);

    let contribution = client.get_contribution(&contribution_id).unwrap();
    assert_eq!(contribution.contributor, contributor);
    assert!(contribution.merged);
}

#[test]
fn test_list_repo_pipelines() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "url"),
    );

    client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "commit1"),
        &String::from_str(&env, "main"),
    );

    client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "commit2"),
        &String::from_str(&env, "dev"),
    );

    let pipelines = client.list_repo_pipelines(&repo_id);
    assert_eq!(pipelines.len(), 2);
}

#[test]
fn test_list_pipeline_stages() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "url"),
    );

    let pipeline_id = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "abc123"),
        &String::from_str(&env, "main"),
    );

    client.add_stage(
        &pipeline_id,
        &StageType::Build,
        &String::from_str(&env, "Build"),
    );
    client.add_stage(
        &pipeline_id,
        &StageType::Test,
        &String::from_str(&env, "Test"),
    );
    client.add_stage(
        &pipeline_id,
        &StageType::Deploy,
        &String::from_str(&env, "Deploy"),
    );

    let stages = client.list_pipeline_stages(&pipeline_id);
    assert_eq!(stages.len(), 3);
}

#[test]
fn test_get_success_rate() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CiCdPipeline, ());
    let client = CiCdPipelineClient::new(&env, &contract_id);

    client.initialize(&admin);

    let repo_id = client.register_repo(
        &owner,
        &String::from_str(&env, "my-repo"),
        &String::from_str(&env, "url"),
    );

    // Create 4 pipelines
    let p1 = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "c1"),
        &String::from_str(&env, "main"),
    );
    let p2 = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "c2"),
        &String::from_str(&env, "main"),
    );
    let p3 = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "c3"),
        &String::from_str(&env, "main"),
    );
    let p4 = client.create_pipeline(
        &repo_id,
        &String::from_str(&env, "c4"),
        &String::from_str(&env, "main"),
    );

    // 3 succeed, 1 fails
    client.update_pipeline(&p1, &PipelineStatus::Success);
    client.update_pipeline(&p2, &PipelineStatus::Success);
    client.update_pipeline(&p3, &PipelineStatus::Failed);
    client.update_pipeline(&p4, &PipelineStatus::Success);

    let success_rate = client.get_success_rate(&repo_id);
    assert_eq!(success_rate, 75); // 3 out of 4 = 75%
}
