# CI/CD Pipeline Smart Contract

A Soroban smart contract for managing CI/CD pipelines for the Open Source Contribution Trainer in the Web3 Student Lab platform.

## Features

- **Repository Management**: Register and track repositories
- **Pipeline Execution**: Create and manage CI/CD pipeline runs
- **Stage Management**: Define build, test, lint, deploy, and security stages
- **Status Tracking**: Monitor pipeline and stage status in real-time
- **Contribution Recording**: Track merged contributions
- **Success Metrics**: Calculate pipeline success rates

## Pipeline Stages

- `Build` - Compilation and build steps
- `Test` - Automated testing
- `Lint` - Code quality checks
- `Deploy` - Deployment stages
- `Security` - Security scanning

## Pipeline Status

- `Pending` - Waiting to start
- `Running` - Currently executing
- `Success` - Completed successfully
- `Failed` - Execution failed
- `Cancelled` - Manually stopped

## API

### Repository Management
- `register_repo(owner, name, url)` - Register a repository
- `get_repository(repo_id)` - Get repository details

### Pipeline Management
- `create_pipeline(repo_id, commit_hash, branch)` - Create pipeline run
- `update_pipeline(pipeline_id, status)` - Update pipeline status
- `get_pipeline(pipeline_id)` - Get pipeline details
- `list_repo_pipelines(repo_id)` - List pipelines for a repo

### Stage Management
- `add_stage(pipeline_id, stage_type, name)` - Add pipeline stage
- `update_stage(stage_id, status, duration, logs)` - Update stage
- `get_stage(stage_id)` - Get stage details
- `list_pipeline_stages(pipeline_id)` - List stages in pipeline

### Contributions
- `record_contribution(repo_id, contributor, pipeline_id, merged)` - Record contribution
- `get_contribution(contribution_id)` - Get contribution details

### Metrics
- `get_success_rate(repo_id)` - Calculate pipeline success rate

## Testing

All tests pass with comprehensive coverage of repository registration, pipeline creation, stage management, and success rate calculation.
