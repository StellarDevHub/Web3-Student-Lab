#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PipelineStatus {
    Pending,
    Running,
    Success,
    Failed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StageType {
    Build,
    Test,
    Lint,
    Deploy,
    Security,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Repository {
    pub id: u64,
    pub name: String,
    pub owner: Address,
    pub url: String,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pipeline {
    pub id: u64,
    pub repo_id: u64,
    pub commit_hash: String,
    pub branch: String,
    pub status: PipelineStatus,
    pub started_at: u64,
    pub completed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PipelineStage {
    pub id: u64,
    pub pipeline_id: u64,
    pub stage_type: StageType,
    pub name: String,
    pub status: PipelineStatus,
    pub duration: u64,
    pub logs: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contribution {
    pub id: u64,
    pub repo_id: u64,
    pub contributor: Address,
    pub pipeline_id: u64,
    pub merged: bool,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    RepoCounter,
    PipelineCounter,
    StageCounter,
    ContributionCounter,
    Repository(u64),
    Pipeline(u64),
    PipelineStage(u64),
    Contribution(u64),
    RepoPipelines(u64),
    PipelineStages(u64),
}

#[contract]
pub struct CiCdPipeline;

#[contractimpl]
impl CiCdPipeline {
    /// Initialize the contract
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::RepoCounter, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::PipelineCounter, &0u64);
        env.storage().instance().set(&DataKey::StageCounter, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::ContributionCounter, &0u64);
    }

    /// Register a repository
    pub fn register_repo(env: Env, owner: Address, name: String, url: String) -> u64 {
        owner.require_auth();

        let repo_id: u64 = env.storage().instance().get(&DataKey::RepoCounter).unwrap();

        let repo = Repository {
            id: repo_id,
            name,
            owner: owner.clone(),
            url,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Repository(repo_id), &repo);
        env.storage()
            .instance()
            .set(&DataKey::RepoCounter, &(repo_id + 1));

        env.events().publish(
            (String::from_str(&env, "repo_registered"),),
            (repo_id, owner),
        );

        repo_id
    }

    /// Create a CI/CD pipeline run
    pub fn create_pipeline(env: Env, repo_id: u64, commit_hash: String, branch: String) -> u64 {
        // Verify repo exists
        let _repo: Repository = env
            .storage()
            .persistent()
            .get(&DataKey::Repository(repo_id))
            .unwrap();

        let pipeline_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PipelineCounter)
            .unwrap();

        let pipeline = Pipeline {
            id: pipeline_id,
            repo_id,
            commit_hash,
            branch,
            status: PipelineStatus::Pending,
            started_at: env.ledger().timestamp(),
            completed_at: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Pipeline(pipeline_id), &pipeline);
        env.storage()
            .instance()
            .set(&DataKey::PipelineCounter, &(pipeline_id + 1));

        // Track pipelines by repo
        let repo_pipelines_key = DataKey::RepoPipelines(repo_id);
        let mut repo_pipelines: Vec<u64> = env
            .storage()
            .persistent()
            .get(&repo_pipelines_key)
            .unwrap_or(Vec::new(&env));
        repo_pipelines.push_back(pipeline_id);
        env.storage()
            .persistent()
            .set(&repo_pipelines_key, &repo_pipelines);

        env.events().publish(
            (String::from_str(&env, "pipeline_created"),),
            (pipeline_id, repo_id),
        );

        pipeline_id
    }

    /// Add a stage to a pipeline
    pub fn add_stage(env: Env, pipeline_id: u64, stage_type: StageType, name: String) -> u64 {
        // Verify pipeline exists
        let _pipeline: Pipeline = env
            .storage()
            .persistent()
            .get(&DataKey::Pipeline(pipeline_id))
            .unwrap();

        let stage_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StageCounter)
            .unwrap();

        let stage = PipelineStage {
            id: stage_id,
            pipeline_id,
            stage_type,
            name,
            status: PipelineStatus::Pending,
            duration: 0,
            logs: String::from_str(&env, ""),
        };

        env.storage()
            .persistent()
            .set(&DataKey::PipelineStage(stage_id), &stage);
        env.storage()
            .instance()
            .set(&DataKey::StageCounter, &(stage_id + 1));

        // Track stages by pipeline
        let pipeline_stages_key = DataKey::PipelineStages(pipeline_id);
        let mut pipeline_stages: Vec<u64> = env
            .storage()
            .persistent()
            .get(&pipeline_stages_key)
            .unwrap_or(Vec::new(&env));
        pipeline_stages.push_back(stage_id);
        env.storage()
            .persistent()
            .set(&pipeline_stages_key, &pipeline_stages);

        stage_id
    }

    /// Update stage status
    pub fn update_stage(
        env: Env,
        stage_id: u64,
        status: PipelineStatus,
        duration: u64,
        logs: String,
    ) {
        let mut stage: PipelineStage = env
            .storage()
            .persistent()
            .get(&DataKey::PipelineStage(stage_id))
            .unwrap();

        stage.status = status;
        stage.duration = duration;
        stage.logs = logs;

        env.storage()
            .persistent()
            .set(&DataKey::PipelineStage(stage_id), &stage);

        env.events().publish(
            (String::from_str(&env, "stage_updated"),),
            (stage_id, stage.status.clone()),
        );
    }

    /// Update pipeline status
    pub fn update_pipeline(env: Env, pipeline_id: u64, status: PipelineStatus) {
        let mut pipeline: Pipeline = env
            .storage()
            .persistent()
            .get(&DataKey::Pipeline(pipeline_id))
            .unwrap();

        pipeline.status = status;

        if matches!(
            pipeline.status,
            PipelineStatus::Success | PipelineStatus::Failed | PipelineStatus::Cancelled
        ) {
            pipeline.completed_at = env.ledger().timestamp();
        }

        env.storage()
            .persistent()
            .set(&DataKey::Pipeline(pipeline_id), &pipeline);

        env.events().publish(
            (String::from_str(&env, "pipeline_updated"),),
            (pipeline_id, pipeline.status.clone()),
        );
    }

    /// Record a contribution
    pub fn record_contribution(
        env: Env,
        repo_id: u64,
        contributor: Address,
        pipeline_id: u64,
        merged: bool,
    ) -> u64 {
        contributor.require_auth();

        let contribution_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ContributionCounter)
            .unwrap();

        let contribution = Contribution {
            id: contribution_id,
            repo_id,
            contributor: contributor.clone(),
            pipeline_id,
            merged,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Contribution(contribution_id), &contribution);
        env.storage()
            .instance()
            .set(&DataKey::ContributionCounter, &(contribution_id + 1));

        env.events().publish(
            (String::from_str(&env, "contribution_recorded"),),
            (contribution_id, contributor, merged),
        );

        contribution_id
    }

    /// Get repository details
    pub fn get_repository(env: Env, repo_id: u64) -> Option<Repository> {
        env.storage()
            .persistent()
            .get(&DataKey::Repository(repo_id))
    }

    /// Get pipeline details
    pub fn get_pipeline(env: Env, pipeline_id: u64) -> Option<Pipeline> {
        env.storage()
            .persistent()
            .get(&DataKey::Pipeline(pipeline_id))
    }

    /// Get stage details
    pub fn get_stage(env: Env, stage_id: u64) -> Option<PipelineStage> {
        env.storage()
            .persistent()
            .get(&DataKey::PipelineStage(stage_id))
    }

    /// Get contribution details
    pub fn get_contribution(env: Env, contribution_id: u64) -> Option<Contribution> {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(contribution_id))
    }

    /// List pipelines for a repository
    pub fn list_repo_pipelines(env: Env, repo_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RepoPipelines(repo_id))
            .unwrap_or(Vec::new(&env))
    }

    /// List stages for a pipeline
    pub fn list_pipeline_stages(env: Env, pipeline_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::PipelineStages(pipeline_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Get pipeline success rate for a repo
    pub fn get_success_rate(env: Env, repo_id: u64) -> u32 {
        let pipelines = Self::list_repo_pipelines(env.clone(), repo_id);

        if pipelines.is_empty() {
            return 0;
        }

        let mut success_count = 0u32;

        for pipeline_id in pipelines.iter() {
            if let Some(pipeline) = Self::get_pipeline(env.clone(), pipeline_id) {
                if pipeline.status == PipelineStatus::Success {
                    success_count += 1;
                }
            }
        }

        (success_count * 100) / pipelines.len()
    }
}

#[cfg(test)]
mod test;
