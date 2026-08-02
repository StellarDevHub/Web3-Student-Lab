#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    TestNotFound = 1,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TestStatus {
    Pending,
    Running,
    Passed,
    Failed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LearningModule {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub test_count: u32,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TestCase {
    pub id: u64,
    pub module_id: u64,
    pub title: String,
    pub test_data: String,
    pub expected_result: String,
    pub status: TestStatus,
    pub score: u32,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TestResult {
    pub test_id: u64,
    pub user: Address,
    pub passed: bool,
    pub actual_result: String,
    pub score_earned: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserProgress {
    pub user: Address,
    pub module_id: u64,
    pub tests_passed: u32,
    pub total_score: u32,
    pub last_test_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    ModuleCounter,
    TestCounter,
    ResultCounter,
    Module(u64),
    TestCase(u64),
    TestResult(u64),
    UserProgress(Address, u64),
    ModuleTests(u64),
}

#[contract]
pub struct AutomatedTestingSuite;

#[contractimpl]
impl AutomatedTestingSuite {
    /// Initialize the contract
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ModuleCounter, &0u64);
        env.storage().instance().set(&DataKey::TestCounter, &0u64);
        env.storage().instance().set(&DataKey::ResultCounter, &0u64);
    }

    /// Create a learning module
    pub fn create_module(env: Env, creator: Address, title: String, description: String) -> u64 {
        creator.require_auth();

        let module_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ModuleCounter)
            .unwrap();

        let module = LearningModule {
            id: module_id,
            title,
            description,
            test_count: 0,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Module(module_id), &module);
        env.storage()
            .instance()
            .set(&DataKey::ModuleCounter, &(module_id + 1));

        env.events().publish(
            (String::from_str(&env, "module_created"),),
            (module_id, creator),
        );

        module_id
    }

    /// Add a test case to a module
    pub fn add_test(
        env: Env,
        creator: Address,
        module_id: u64,
        title: String,
        test_data: String,
        expected_result: String,
        score: u32,
    ) -> u64 {
        creator.require_auth();

        // Verify module exists
        let mut module: LearningModule = env
            .storage()
            .persistent()
            .get(&DataKey::Module(module_id))
            .unwrap();

        let test_id: u64 = env.storage().instance().get(&DataKey::TestCounter).unwrap();

        let test = TestCase {
            id: test_id,
            module_id,
            title,
            test_data,
            expected_result,
            status: TestStatus::Pending,
            score,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::TestCase(test_id), &test);
        env.storage()
            .instance()
            .set(&DataKey::TestCounter, &(test_id + 1));

        // Update module test count
        module.test_count += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Module(module_id), &module);

        // Track tests by module
        let module_tests_key = DataKey::ModuleTests(module_id);
        let mut module_tests: Vec<u64> = env
            .storage()
            .persistent()
            .get(&module_tests_key)
            .unwrap_or(Vec::new(&env));
        module_tests.push_back(test_id);
        env.storage()
            .persistent()
            .set(&module_tests_key, &module_tests);

        env.events().publish(
            (String::from_str(&env, "test_added"),),
            (test_id, module_id),
        );

        test_id
    }

    /// Submit a test result
    pub fn submit_result(
        env: Env,
        user: Address,
        test_id: u64,
        actual_result: String,
    ) -> Result<bool, Error> {
        user.require_auth();

        // Get test case
        let test: TestCase = env
            .storage()
            .persistent()
            .get(&DataKey::TestCase(test_id))
            .ok_or(Error::TestNotFound)?;

        // Check if result matches expected
        let passed = actual_result == test.expected_result;
        let score_earned = if passed { test.score } else { 0 };

        // Record result
        let result_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ResultCounter)
            .unwrap();
        let result = TestResult {
            test_id,
            user: user.clone(),
            passed,
            actual_result,
            score_earned,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::TestResult(result_id), &result);
        env.storage()
            .instance()
            .set(&DataKey::ResultCounter, &(result_id + 1));

        // Update user progress
        let progress_key = DataKey::UserProgress(user.clone(), test.module_id);
        let mut progress: UserProgress =
            env.storage()
                .persistent()
                .get(&progress_key)
                .unwrap_or(UserProgress {
                    user: user.clone(),
                    module_id: test.module_id,
                    tests_passed: 0,
                    total_score: 0,
                    last_test_at: 0,
                });

        if passed {
            progress.tests_passed += 1;
        }
        progress.total_score += score_earned;
        progress.last_test_at = env.ledger().timestamp();

        env.storage().persistent().set(&progress_key, &progress);

        env.events().publish(
            (String::from_str(&env, "test_submitted"),),
            (test_id, user, passed),
        );

        Ok(passed)
    }

    /// Get module details
    pub fn get_module(env: Env, module_id: u64) -> Option<LearningModule> {
        env.storage().persistent().get(&DataKey::Module(module_id))
    }

    /// Get test case details
    pub fn get_test(env: Env, test_id: u64) -> Option<TestCase> {
        env.storage().persistent().get(&DataKey::TestCase(test_id))
    }

    /// Get test result
    pub fn get_result(env: Env, result_id: u64) -> Option<TestResult> {
        env.storage()
            .persistent()
            .get(&DataKey::TestResult(result_id))
    }

    /// Get user progress for a module
    pub fn get_user_progress(env: Env, user: Address, module_id: u64) -> Option<UserProgress> {
        env.storage()
            .persistent()
            .get(&DataKey::UserProgress(user, module_id))
    }

    /// List all modules
    pub fn list_modules(env: Env) -> Vec<u64> {
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ModuleCounter)
            .unwrap_or(0);
        let mut modules = Vec::new(&env);

        for i in 0..count {
            if env.storage().persistent().has(&DataKey::Module(i)) {
                modules.push_back(i);
            }
        }

        modules
    }

    /// List tests for a module
    pub fn list_module_tests(env: Env, module_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::ModuleTests(module_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Run automated test suite for a module
    pub fn run_test_suite(env: Env, user: Address, module_id: u64) -> u32 {
        user.require_auth();

        let tests = Self::list_module_tests(env.clone(), module_id);
        let mut total_score = 0u32;

        for test_id in tests.iter() {
            if let Some(test) = Self::get_test(env.clone(), test_id) {
                total_score += test.score;
            }
        }

        total_score
    }

    /// Get module completion percentage
    pub fn get_completion(env: Env, user: Address, module_id: u64) -> u32 {
        let module: LearningModule =
            match env.storage().persistent().get(&DataKey::Module(module_id)) {
                Some(m) => m,
                None => return 0,
            };

        let progress: UserProgress = match env
            .storage()
            .persistent()
            .get(&DataKey::UserProgress(user, module_id))
        {
            Some(p) => p,
            None => return 0,
        };

        if module.test_count == 0 {
            return 0;
        }

        (progress.tests_passed * 100) / module.test_count
    }
}

#[cfg(test)]
mod test;
